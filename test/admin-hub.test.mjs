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
import * as FIN from "../admin/finance/src/ui.js";
import * as MKT from "../admin/marketing/src/ui.js";
import * as TF from "../admin/team-forms/src/ui.js";
import * as RC from "../admin/records/src/ui.js";
import * as SR from "../admin/search/src/ui.js";

const IMPL = [["admin", FORMS], ["admin/site", SITE], ["admin/passports", PASS], ["admin/people", PEOPLE], ["admin/finance", FIN], ["admin/marketing", MKT], ["admin/team-forms", TF], ["admin/records", RC], ["admin/search", SR]];
// 後台 2026-10-19 起有中英切換，字典預設英文；這一支大部分斷言的是中文，所以先切成中文。英文那幾條自己切。
for (const [, M] of IMPL) M.setLang("zh");

const ME = {
  member:   { role: "cadre",   board: "member",    team: "Curriculum Team" },
  director: { role: "cadre",   board: "director",  team: "Marketing Team" },
  istaff:   { role: "cadre",   board: "member",    team: "Marketing Team, Internship Team", ws: { "intern-passport": "edit" } },
  senior:   { role: "cadre",   board: "senior_adviser", team: "" },
  pdir:     { role: "cadre",   board: "director",  team: "Curriculum Team", ws: { "apps:Curriculum Team": "manage", "passport": "edit" } },
  pres:     { role: "cadre",   board: "president", team: "" },
  sdir:     { role: "cadre",   board: "director",  team: "Sponsorship Team", ws: { finance: "edit" } },
  mres:     { role: "cadre",   board: "member",    team: "Marketing Team", ws: { "res:Marketing Team": "view" } },
  mreq:     { role: "cadre",   board: "member",    team: "Marketing Team", ws: { "custom:marketing-requests": "edit" } },
  mapp:     { role: "cadre",   board: "member",    team: "Curriculum Team", ws: { "custom:marketing-approve": "view" } },
  // 2026-12-01：my_access() 給了 records 那一格的人（某場活動工作區「改」以上的 Director）。
  rrec:     { role: "cadre",   board: "director",  team: "Curriculum Team", ws: { records: "view", "custom:event-x": "manage" } },
  student:  { role: "student", board: "president", team: "Internship Team" },
  intern:   { role: "intern",  board: "member",    team: "Internship Team" },
};

const DAY = { "custom:calendar": "edit", "custom:meetings": "edit", "custom:projects": "edit", "custom:forms": "edit", "custom:my-passport": "edit", "custom:venues": "edit" };  // 2027-01-24：整個 BT 每天用的六樣，現在的幹部都有

test("★ 四個資料夾的 GROUPS 一字不差", () => {
  for (const [label, M] of IMPL) {
    assert.deepEqual(M.GROUPS, FORMS.GROUPS, `${label} 的 GROUPS 跟 admin/ 不一樣`);
  }
  // 2026-11-14 側欄多「我的」那一段：首頁（/home/）、時間看板、護照三個資料夾在最前面。
  assert.deepEqual(FORMS.GROUPS.map(g => g.key), ["home", "availability", "passport", "forms", "site", "passports", "people", "finance", "marketing", "teamforms", "records", "search", "internwall"]);
  for (const g of FORMS.GROUPS) assert.match(g.href, /^\/(admin|home|availability|passport|intern-passport)\//, "每一組都是站上的一個資料夾");
});

test("★ 四份 canEnter 對同一個人講一樣的話", () => {
  const want = {
    // 2026-11-08 財務：senior 與 my_access 給了 finance 那一格的人（sdir）。
    member:   { forms: true, site: true, passports: false, people: false, finance: false, marketing: false, teamforms: true, records: false },
    director: { forms: true, site: true, passports: false, people: false, finance: false, marketing: false, teamforms: true, records: false },
    istaff:   { forms: true, site: true, passports: true,  people: false, finance: false, marketing: false, teamforms: true, records: false },
    senior:   { forms: true, site: true, passports: true,  people: true,  finance: true, marketing: true, teamforms: true, records: true },
    pdir:     { forms: true, site: true, passports: true,  people: false, finance: false, marketing: false, teamforms: true, records: false },
    sdir:     { forms: true, site: true, passports: false, people: false, finance: true, marketing: false, teamforms: true, records: false },
    pres:     { forms: true, site: true, passports: true,  people: true,  finance: true, marketing: true, teamforms: true, records: true },
    // 2026-11-26 Marketing：Marketing 資源工作區或行銷需求單工作區，任何等級。只掛 team 標籤（director）不算，要被派進工作區。
    mres:     { forms: true, site: true, passports: false, people: false, finance: false, marketing: true, teamforms: true, records: false },
    mreq:     { forms: true, site: true, passports: false, people: false, finance: false, marketing: true, teamforms: true, records: false },
    // 2026-12-25：貼文核可併進 Marketing 的「管」，核可名單停用，只掛在那張名單上的人不再進得來（資料庫已把他們升成 Marketing 的管）。
    mapp:     { forms: true, site: true, passports: false, people: false, finance: false, marketing: false, teamforms: true, records: false },
    rrec:     { forms: true, site: true, passports: false, people: false, finance: false, marketing: false, teamforms: true, records: true },
    // 學員與 intern 什麼都進不去，就算 board_role 或 team 被誤設也一樣。
    student:  { forms: false, site: false, passports: false, people: false, finance: false, marketing: false, teamforms: false, records: false },
    intern:   { forms: false, site: false, passports: false, people: false, finance: false, marketing: false, teamforms: false, records: false },
  };
  // 「我的」那三個資料夾：每一位幹部都進得去（跟 forms 一樣），學員與 intern 不行。
  // 搜尋（2026-11-26）：每一位幹部都進得去，跟 forms 一樣；每一筆讀不讀得到是資料庫的門。
  for (const w of Object.values(want)) { w.home = w.availability = w.passport = w.search = w.forms; }
  // 實習生進度牆（2026-11-27 從設定搬到側欄）：被派進實習護照的人，加 Co-President 與 Senior Adviser。
  for (const [k, w] of Object.entries(want)) w.internwall = ["istaff", "senior", "pres"].includes(k);
  for (const [label, M] of IMPL) {
    for (const [who, me] of Object.entries(ME)) {
      for (const g of M.GROUPS) {
        assert.equal(M.canEnter(g, me), want[who][g.key], `${label}：${who} 對 ${g.key}`);
      }
    }
  }
});

test("★ 側欄（2026-11-13 起 shared/rail.js 一份）：一行一個東西、進不去的不畫、當前那一行有標記、底下的頁是上方一排分頁", () => {
  for (const [label, M] of IMPL) {
    const me = { ...ME.member, name: "王平", ws: DAY };
    // 2027-01-24：一個每天用的都沒被派的幹部，側欄只有首頁（新來的幹部要 Paul 在「整個 BT」加）。
    assert.deepEqual([...M.railHTML("home", "home", { ...ME.member, name: "新", ws: {} }).matchAll(/rail-area[^>]*>[\s\S]*?<b>([^<]+)<\/b>/g)].map(m => m[1]), ["首頁", "Curriculum"], `${label}：沒被派的最上面只有首頁（他的 team 那一行照舊在我的工作區）`);
    // 2026-11-27 第二版：對外網站是要派人的工作區，只有被派進去的人有那一行；某個 team「改」以上的人改資源庫與 BT 島，入口在他 team 那一行底下。
    const ed = { ...me, ws: { ...DAY, "res:Curriculum Team": "edit" } };
    const rail = M.railHTML("site", "res", ed);
    assert.doesNotMatch(rail, /<b>對外網站<\/b>/, `${label}：沒被派進對外網站就沒有那一行`);
    assert.match(rail, /<a class="rail-item rail-area rail-team here"[^>]*>[\s\S]*?<b>Curriculum<\/b>[\s\S]*?<a class="rail-item rail-sub on" href="#res" data-act="tab" data-t="res" aria-current="page">資源庫<\/a>/, `${label}：資源庫在他 team 底下，亮著`);
    assert.match(M.railHTML("site", "history", { ...me, ws: { ...DAY, "custom:website": "edit" } }), /<a class="rail-item rail-area here" href="#history" data-act="tab" data-t="history">.*?<b>對外網站<\/b>/, `${label}：被派進對外網站的人有那一行，點下去是歷史之路`);
    assert.doesNotMatch(M.railHTML("forms", "projects", me), /<b>對外網站<\/b>/, `${label}：一般幹部沒有對外網站`);
    // 別的資料夾是帶 ?lang= 與 # 的一般連結。
    // 2026-12-26：「活動」那一行改叫「專案」，點下去是專案清單；場地搬到組織（整個 BT）。
    assert.match(rail, /<a class="rail-item rail-area" href="\/admin\/\?lang=zh#projects">.*?<b>專案<\/b>/, label);
    // 2026-11-28 Paul：「put venue into records」。沒被派進紀錄、只有場地的人，紀錄那一行點下去就是場地。
    assert.match(rail, /href="\/admin\/\?lang=zh#venues">.*?<b>紀錄<\/b>[\s\S]*<div class="rail-group">我的工作區<\/div>/, label);
    assert.doesNotMatch(rail, /<b>場地<\/b>/, `${label}：場地不再自己一行`);
    assert.doesNotMatch(rail, /<div class="rail-group">(組織|整個 BT|我的)<\/div>/, `${label}：「我的」與「整個 BT」合成最上面一段，不加標題（2026-11-27 第二版）`);
    // 最上面那一段：首頁連到 /home/（不帶 #），行事曆是 /home/#calendar，護照是 /passport/。
    assert.match(rail, /<\/form>\s*<a class="rail-item rail-area" href="\/home\/\?lang=zh">.*?<b>首頁<\/b>/, `${label}：首頁在搜尋框底下（2026-11-27 第三版）`);
    assert.match(rail, /href="\/home\/\?lang=zh#calendar">.*?<b>行事曆<\/b>/, label);
    assert.doesNotMatch(rail, /<b>我的護照<\/b>/, `${label}：我的護照 2026-11-28 搬到頂欄`);
    assert.doesNotMatch(rail, /<b>待辦<\/b>/, `${label}：後台的待辦併進首頁了`);
    // 一頁都進不去的那一行整行不畫。
    for (const no of ["護照", "錢", "人與權限"]) assert.doesNotMatch(rail, new RegExp(`<b>${no}</b>`), `${label}：一般幹部沒有${no}`);
    assert.doesNotMatch(rail, /href="\/admin\/people\//, `${label}：一般幹部不該拿到人與權限的連結`);
    assert.doesNotMatch(rail, /rail-item off|<details/, `${label}：不再有淡掉的行與折疊段，最上面的「新增」也拿掉了（2026-11-27 第二版）`);
    assert.match(rail, /rail-me"><b>王平<\/b>\s*<span>Associate・Curriculum Team/, `${label}：側欄上要寫名字、職級、team`);
    // 上方那一排分頁：只有看得到的頁；一般幹部在對外網站只有資源庫一頁，就不畫那一排。
    // 2026-11-27 第二版：表單那一行一般幹部也有兩頁（要我填的、所有表單），所以拿只有一頁的場地來看。
    assert.equal(M.shellHTML("", M.railHTML("forms", "venues", me), "B").includes("area-tabs"), false, `${label}：只有一頁就不畫分頁列`);
    assert.equal(M.shellHTML("", M.railHTML("teamforms", "fill", me), "B").includes("area-tabs"), true, `${label}：表單有要我填的與所有表單兩頁`);
    const pres = { ...ME.pres, name: "王平" };
    const ph = M.shellHTML("", M.railHTML("site", "team", pres), "B");
    assert.match(ph, /<a class="area-tab on" href="#team" data-act="tab" data-t="team" aria-current="page">團隊頁<\/a>/, label);
    assert.match(ph, /area-tab" href="#events" data-act="tab" data-t="events">網站上的活動/, label);
    // Co-President：十個東西都在。
    const pr = M.railHTML("forms", "teams", pres);
    // 「我的工作區」那一段的 team 行（rail-team）另外算：Co-President 與 Senior Adviser 的六個 team 收成一行「所有 team」（2026-11-27 第二版）。
    // 人與權限與搜尋在頂欄、錢在 Sponsorship 底下，這三個不是側欄上的一行。
    assert.equal((pr.match(/class="rail-item rail-area(?! rail-team)/g) || []).length, M.AREAS.filter(a => ["me", "ws"].includes(a.sec)).length, `${label}：Co-President 每一行都在`);
    assert.equal((pr.match(/class="rail-item rail-area rail-team/g) || []).length, 1, `${label}：Co-President 的六個 team 收成一行`);
    assert.match(pr, /Co-President・全部 team/, label);
    assert.match(M.railHTML("forms", "teams", { ...ME.senior, name: "顧", team: "Marketing Team" }), /Senior Adviser・全部 team/, `${label}：Senior Adviser 就算勾了標籤也印全部 team`);
    // 2026-12-25 起 Senior Adviser 讀得到校友故事與變動紀錄（資料庫也開了），兩頁都畫。Associate 照舊沒有。
    const sa = { ...ME.senior, name: "顧" };
    assert.ok(M.canSee(M.ITEMS.find(i => i.key === "stories"), sa), `${label}：Senior Adviser 有校友故事`);
    assert.ok(M.canSee(M.ITEMS.find(i => i.key === "changes"), sa), `${label}：Senior Adviser 有變動紀錄`);
    assert.ok(!M.canSee(M.ITEMS.find(i => i.key === "changes"), ME.member || { role: "cadre", board: "member", ws: {} }), `${label}：Associate 沒有變動紀錄`);
  }
});

test("★ 四份側欄與五個小零件逐字一樣（ITEMS、railHTML、shellHTML、pageHead、msgHTML、sectionHTML、emptyHTML）", () => {
  for (const [label, M] of IMPL) {
    assert.deepEqual(M.ITEMS, FORMS.ITEMS, `${label} 的 ITEMS 跟 admin/ 不一樣`);
    for (const fn of ["railHTML", "shellHTML", "pageHead", "msgHTML", "msgKind", "sectionHTML", "emptyHTML", "skeletonHTML", "canSee", "canEnter", "boardName",
                       "toast", "needAsk", "mountAsk", "cancelAsk", "afterRender", "downHTML",
                       "mpName", "mpFind", "mpItems", "mpLinksHTML", "membersPanelHTML",
                       "pkTeamsOf", "pkCandidates", "pkShown", "pkTickAll", "pkToggle", "pkPicked", "pkReduce", "batchUndo", "pkRefocus", "rankTag", "membersAreaHTML", "wsListRows", "levelOptions", "wsListHTML",
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
  for (const f of ["admin/src/main.js", "admin/site/src/main.js", "admin/passports/src/main.js", "admin/people/src/main.js", "admin/finance/src/main.js", "admin/marketing/src/main.js", "admin/team-forms/src/main.js", "admin/records/src/main.js", "admin/search/src/main.js"]) {
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
  assert.deepEqual(S.ask, { act: "ws-unassign", id: "u1", text: "真的要移出？", data: { act: "ws-unassign", id: "u1" } });
  const yes = { dataset: { act: "ws-unassign", id: "u1", confirmed: "1" } };
  assert.equal(FORMS.needAsk(S, yes, "真的要移出？"), false);
  assert.equal(S.ask, null);
});

// 2026-10-28：沒有 data-id、靠 data-month 分的按鈕（刪月份），確認框要掛在按的那一顆旁邊，「確定」帶的也是那個月。
test("★ mountAsk 認得是哪一顆：按 10 月的刪除不會掛到 9 月", () => {
  const mk = m => ({ dataset: { act: "month-del", month: m }, closest: () => null, hidden: false, after: null,
    insertAdjacentElement(_, el) { this.after = el; } });
  const sep = mk("9"), oct = mk("10");
  const yesBtn = { dataset: {} };
  const row = { className: "", set innerHTML(v) {}, querySelector: () => yesBtn };
  const root = { querySelectorAll: q => q === ".ask" ? [] : [sep, oct] };
  const saved = globalThis.document; globalThis.document = { createElement: () => row, querySelectorAll: root.querySelectorAll };
  try {
    const S = {};
    FORMS.needAsk(S, oct, "刪 10 月？");
    FORMS.mountAsk(root, S.ask);
    assert.equal(sep.hidden, false, "9 月那顆不該被換掉");
    assert.equal(oct.hidden, true); assert.equal(oct.after, row);
    assert.equal(yesBtn.dataset.month, "10", "「確定」要帶 10 月");
  } finally { globalThis.document = saved; }
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

// 2026-11-26：後台的「各 team」那一頁拿掉了（Paul：「teams can be moved to roster, or we don't even need them」）。
// 那一頁上唯一還有用的一張卡，還沒寄出去的信（「現在寄出去」那顆鈕），搬到活動清單最上面；/home/ 的「有信沒寄出去」連到那裡。
test("★ 還沒寄出去的信那一張卡搬到活動清單最上面；沒有信就不畫；各 team 那一頁的三支函式都不在了", () => {
  const h = FORMS.unsentMailHTML({ ...ME.pres, name: "王平" }, FORMS_DATA, [{ id: 1, tries: 0 }, { id: 2, tries: 2, error: "boom" }], TODO, true, false);
  assert.match(h, /<h2>還沒寄出去的信/);
  assert.match(h, /<div class="kpi-n">2<span class="kpi-u">封/);
  assert.match(h, /1 封試過但失敗了：boom/);
  assert.match(h, /data-act="send-mail-all"/);
  assert.doesNotMatch(h, /還沒處理的申請|等你核可上團隊頁|這一屆的 intern|kpi-l">幹部/);
  assert.doesNotMatch(FORMS.unsentMailHTML({ ...ME.member, name: "左芷君" }, FORMS_DATA, [{ id: 1, tries: 0 }], {}, false, false), /send-mail-all/, "寄不動的人沒有那顆鈕");
  assert.equal(FORMS.unsentMailHTML({ ...ME.member, name: "a" }, [], [], {}, false, false), "", "沒有信等著寄就整塊不畫");
  for (const gone of ["hubHTML", "teamBlocksHTML", "accessHTML"]) assert.equal(FORMS[gone], undefined, gone + " 拿掉了");
  const m = readFileSync("admin/src/main.js", "utf8");
  assert.match(m, /body = UI\.unsentMailHTML\(S\.me, S\.forms, S\.pendingAll, S\.todo, canEdit\(\), S\.busy\)\s*\+ UI\.eventsListHTML\(/);
  assert.doesNotMatch(m, /hubHTML|featuresFor/);
  assert.match(readFileSync("home/src/ui.js", "utf8"), /title: T\("w\.mailT", \{ n: mn \}\), sub: T\("w\.mailSub"\), href: A\("\/admin\/#events"\)/, "首頁那一則連到活動那一頁");
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
    assert.ok(/href="\.\.\/\.\.\/shared\/brand\.css(\?v=[A-Za-z0-9-]+)?"/.test(html), `${f}/index.html 沒有讀 brand.css`);
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
  assert.match(open, /<input type="hidden" id="nf-kind" value="board">/, "2026-11-26：這一頁只開幹部招募的表單，種類不用選");
  assert.doesNotMatch(open, /<select id="nf-kind"/);
  assert.match(open, /data-act="new-form-save"/);
  assert.match(open, /data-act="new-form-cancel"/);
  assert.doesNotMatch(open, /class="btn" data-act="new-form">/, "表單展開著的時候頁首那顆收起來");
  // 不是 Co-President：team 是固定的，不能選。
  const mine = FORMS.listHTML([AF], true, "", false, { title: "x", team: "Curriculum Team", kind: "program" }, [], "Curriculum Team", false);
  assert.match(mine, /id="nf-team" value="Curriculum Team" disabled/);
});

test("Co-President 的申請表清單照 team 分段，Director 的不分", () => {
  // 2026-11-26：這一頁是幹部招募，列的是 kind 是 board 的表單。
  const BF = { ...AF, kind: "board" };
  const two = [BF, { ...BF, id: "f2", title: "招募", team: "Marketing Team" }];
  const pres = FORMS.listHTML(two, true, "", true, null, [], "", false);
  assert.match(pres, /<h2>Curriculum<span class="hint">1 份/);
  assert.match(pres, /<h2>Marketing<span class="hint">1 份/);
  // 2026-10-30 起申請是整個 BT 一個工作區：看得到的人看得到全部，team 只是標籤，有兩個以上的 team 就照標籤分段，Director 也一樣。
  const dir = FORMS.listHTML(two, true, "", false, null, [], "", false);
  assert.match(dir, /<h2>Curriculum/);
  assert.doesNotMatch(FORMS.listHTML([BF], true, "", false, null, [], "", false), /<h2>Curriculum/, "只有一個 team 就不分段");
});

test("一份表單裡的四個分頁：申請、題目、設定、活動，當前的有標記，四個畫面都有同一條", () => {
  assert.match(FORMS.formTabsHTML(AF, "apps"), /class="subtab on" data-act="open-apps" data-id="f1" aria-current="page">申請/);
  assert.deepEqual([...FORMS.formTabsHTML(AF, "apps").matchAll(/>([^<]+)<\/button>/g)].map(m => m[1]), ["申請", "題目", "設定", "活動"]);
  assert.equal((FORMS.formTabsHTML(AF, "apps").match(/class="subtab on"/g) || []).length, 1, "在「申請」的時候題目與設定都不亮");
  // 「題目」與「設定」是同一個畫面的兩個分頁（2026-11-24），開著哪一個是記著的；第一次是「題目」
  assert.match(FORMS.formTabsHTML(AF, "question"), /class="subtab on" data-act="open-form" data-id="f1" data-sub="questions" aria-current="page">題目/);
  FORMS.setFormSub("settings");
  assert.match(FORMS.formTabsHTML(AF, "form"), /class="subtab on" data-act="open-form" data-id="f1" data-sub="settings" aria-current="page">設定/);
  assert.match(FORMS.formHTML(AF, [], true, [], "", false), /<div class="tabp" data-ptabs="form" data-tabp="questions" hidden>[\s\S]*<div class="tabp" data-ptabs="form" data-tabp="settings">/, "兩塊都在畫面裡，沒選到的藏著");
  FORMS.setFormSub("nope"); assert.equal(FORMS.formSub(), "settings", "認不得的名字不收");
  FORMS.setFormSub("questions");
  assert.match(FORMS.formHTML(AF, [], true, [], "", false), /<div class="tabp" data-ptabs="form" data-tabp="questions">[\s\S]*<div class="tabp" data-ptabs="form" data-tabp="settings" hidden>/);
  assert.match(FORMS.formTabsHTML(AF, "notice"), /class="subtab on" data-act="open-checkin"[^>]*>活動/);
  // main.js：已經在這份表單的編輯畫面上，按「題目」「設定」只換哪一塊看得到，不重讀
  assert.match(readFileSync("admin/src/main.js", "utf8"), /if \(sub && \(S\.view === "form" \|\| S\.view === "question"\) && S\.form && S\.form\.id === id\) \{\s*document\.querySelectorAll\('\.tabp\[data-ptabs="form"\]'\)/);
  for (const h of [
    FORMS.formHTML(AF, [], true, [], "", false),
    FORMS.appsHTML(AF, [], [], true, new Set(), "all", [], "", false),
    FORMS.checkinHTML(AF, [], true, "", false),
    FORMS.noticeHTML(AF, [], new Set(), "", false),
  ]) {
    assert.match(h, /class="subtabs ptabs"/);
    assert.match(h, /data-act="back-list"/);
  }
});

// ── 中英切換（2026-10-19，docs/2026-10-19-後台中英切換.md）────────────────
// 四份 strings.js 的 COMMON 與機制要一模一樣；每個鍵中英都要有；每個畫面用英文畫出來不能剩中文。
import * as FORMS_S from "../admin/src/strings.js";
import * as SITE_S from "../admin/site/src/strings.js";
import * as PASS_S from "../admin/passports/src/strings.js";
import * as PEOPLE_S from "../admin/people/src/strings.js";
import * as FIN_S from "../admin/finance/src/strings.js";
import * as MKT_S from "../admin/marketing/src/strings.js";
import * as TF_S from "../admin/team-forms/src/strings.js";
import * as RC_S from "../admin/records/src/strings.js";
import * as SR_S from "../admin/search/src/strings.js";
const STR = [["admin", FORMS_S], ["admin/site", SITE_S], ["admin/passports", PASS_S], ["admin/people", PEOPLE_S], ["admin/finance", FIN_S], ["admin/marketing", MKT_S], ["admin/team-forms", TF_S], ["admin/records", RC_S], ["admin/search", SR_S]];

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

// 2026-11-27 Paul 看了側欄最上面那兩顆「中文 / English」：「Dont think we need that out at front」。切換只留在 /settings/。
test("★ 側欄沒有中英切換（只在設定那一頁）；英文側欄照舊是英文", () => {
  for (const [label, M] of IMPL) {
    const rail = M.railHTML("forms", "teams", { ...ME.member, name: "a" });
    assert.doesNotMatch(rail, /data-act="lang"|rail-lang/, label);
  }
  FORMS.setLang("en");
  try {
    const rail = FORMS.railHTML("forms", "teams", { ...ME.member, name: "a", ws: DAY });
    assert.doesNotMatch(rail, /data-act="lang"/);
    assert.match(rail, />All pages</, "手機上那顆鈕不跟頂欄的「選單」同名");
    assert.match(rail, /<b>Records<\/b>[\s\S]*<div class="rail-group">My workspaces<\/div>/);
  } finally { FORMS.setLang("zh"); }
  assert.match(readFileSync("settings/src/ui.js", "utf8"), /data-act="lang" data-lang="\$\{l\}"/, "設定那一頁還有");
});

// 英文畫出來不能剩中文。餵進去的假資料全部用英文，剩下的中文就是漏翻的。
// 剔除：HTML 註解（樣板裡的中文註解）、placeholder（有幾格本來就要填中文）、
// 信件預覽（信是寄給台灣學生的，範例與系統加的那段本來就是中文）。
const CJK = /[一-鿿]/;
function leftover(html) {
  const h = String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/ placeholder="[^"]*"/g, "")
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
    mail: () => FORMS.unsentMailHTML(EN_ME, [form], [{ id: 1, tries: 2, error: "boom" }], todo, true, false),
    appsRecruit: () => FORMS.appsHTML(form, [app], qs, true, new Set(), "all", [], "", false, { can: true, ready: true, status: { a1: "none" }, set: null, terms: [{ id: "2026-27", status: "current" }], teams: ["Marketing Team"] }),
    appsRecruitStates: () => ["joined", "pending", "expired", "on_roster"].map(st => FORMS.recruitTagHTML(app, { can: true, ready: true, status: { a1: st } }, false)).join(""),
    appsRecruitWait: () => FORMS.recruitPanelHTML(form, { can: false }, false) + FORMS.recruitPanelHTML(form, { can: true, ready: false }, false),
    recruitNote: () => FORMS.recruitResultNote({ sent: 2, skipped: ["already_cadre", "invite_pending", "on_roster", "ambiguous_person", "bad_email", "not_accepted", "zzz"].map(why => ({ id: "x", why })) }),
    list: () => FORMS.listHTML([form, { ...form, id: "f2", team: "", kind: "program", status: "draft" }], true, "Saved.", true, null, [], "", false),
    listMember: () => FORMS.listHTML([], false, "", false, null, [], "", false),
    listNew: () => FORMS.listHTML([form], true, "", true, { title: "", team: "Marketing Team", kind: "board" }, ["Marketing Team"], "", true),
    form: () => FORMS.formHTML(form, qs, true, ["Marketing Team"], "", true),
    formRo: () => FORMS.formHTML({ ...form, status: "closed" }, [], false, [], "Could not save: x", false),
    question: () => FORMS.questionsHTML(qs, true, { mode: "edit", menuAt: 0 }) + FORMS.questionsHTML(qs, true, { mode: "preview" }),
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
test("★ 成員分頁：一張名單，每一位幹部一行一個下拉（沒有・看・改・管）；入口只給「管」的人，senior 全部", () => {
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
  // 2026-11-28 一張名單（wsListHTML，ns "mp"）：Paul「can we just make it into one page」。沒有左右兩欄、沒有「加 N 個人」。
  assert.equal(h.split('<section class="ma-col">').length, 2, "只有一欄");
  assert.doesNotMatch(h, /members-assign|members-unassign|還沒在裡面/);
  assert.match(h, /在這個工作區 2 人・名單共 3 人/, "王平（依職級）加 Mei；小新不在裡面但列著");
  assert.match(h, /<select class="ro-lv" data-act="members-level" data-id="u3"[^>]*><option value="none">沒有<\/option><option value="view" selected>看<\/option>/);
  assert.match(h, /<div class="ma-row ro-row out"><input type="checkbox" class="ma-sel" data-act="pk-sel" data-ns="mp" value="u4"[\s\S]*?<select class="ro-lv" data-act="members-level" data-id="u4"[^>]*><option value="none" selected>沒有/, "不在裡面的人字淡、下拉是「沒有」，選別的就是加進來");
  assert.ok(h.indexOf('value="u3"') < h.indexOf('value="u4"'), "在裡面的排前面");
  // 王平是 Co-President 卻還留著一筆指派：只畫一列「全部（職級）」，沒有下拉；senior 才看得到清掉。
  assert.equal((h.match(/王平/g) || []).length, 1, "一個人一列");
  assert.match(h, /<div class="ma-row byrank"><span class="nm"><b>王平<\/b><span class="nm-en">Paul<\/span><\/span><span class="rk" title="Co-President">CP<\/span><span class="mini">這是你<\/span><span class="mini">全部（職級）/);
  assert.doesNotMatch(h, /data-act="members-level" data-id="u1"/, "依職級的人沒有下拉");
  assert.doesNotMatch(h, /members-cleanup/, "不是 senior 看不到清掉");
  assert.match(FORMS.membersPanelHTML(Object.assign({}, mp, { senior: true }), "", false), /另外有 1 筆指派是給靠職級就有一切的人的，多餘。 <button type="button" class="lnk" data-act="members-cleanup" data-ids="u1">清掉這 1 筆<\/button>/);
  assert.match(h, /<span class="nm"><b>小新<\/b><span class="nm-en">Shin<\/span><\/span><span class="rk" title="Associate">AS<\/span>/, "職級是兩個字母的標，不是 pill");
  // 上面那一排：找名字、全勾看到的、全部取消、要改成哪一級、N 個人改成這一級。
  assert.match(h, /<div class="ma-head">[\s\S]*<input id="mp-q" class="ma-find"[\s\S]*data-act="pk-selall" data-ns="mp" data-ids="u3,u4"[\s\S]*data-act="pk-selnone"[\s\S]*<select id="mp-blevel" data-act="pk-blevel"[\s\S]*data-act="members-bulk" data-op="level" data-ns="mp" disabled>0 個人改成這一級<\/button><\/div>\s*<\/div>\s*<div class="ma-list">/);
  const picked = FORMS.membersPanelHTML(Object.assign({}, mp, { pk: { sel: ["u3", "u4"], blevel: "none" } }), "", false);
  assert.match(picked, /data-act="members-bulk" data-op="level" data-ns="mp">2 個人改成這一級/);
  assert.match(picked, /<select id="mp-blevel"[^>]*><option value="none" selected>沒有/);
  assert.match(picked, /<div class="ma-row ro-row out on">/, "勾起來的那一列有底色");
  assert.equal(FORMS.mpFind(mp.cadres, "小新 (Shin)").id, "u4");
  assert.equal(FORMS.mpFind(mp.cadres, "mei").id, "u3");
  assert.equal(FORMS.mpFind(mp.cadres, "x"), null);
  assert.match(FORMS.membersPanelHTML({ ws: "x", rows: [], cadres: [] }, "", false), /沒有對得上的人/);
  assert.match(FORMS.membersPanelHTML(Object.assign({}, mp, { pk: { q: "shin" } }), "", false), /篩出 1 人/);
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

test("★ 三個功能資料夾的 main.js 都接了成員分頁：開、回、改等級（含沒有＝移出）、一次改很多人，寫的是 assign / unassign，不讀 email", () => {
  for (const f of ["admin/src", "admin/site/src", "admin/passports/src"]) {
    const m = readFileSync(`${f}/main.js`, "utf8"), d = readFileSync(`${f}/data.js`, "utf8");
    for (const act of ["members-open", "members-back", "members-level", "members-bulk", "members-cleanup"]) assert.match(m, new RegExp(act), `${f} 沒接 ${act}`);
    // 2026-11-28 一張名單：下拉選「沒有」是移出、不在裡面的人選看改管是加進來；勾好幾個人一次改，改成「沒有」先問一次。
    assert.match(m, /to = el\.value === "none" \? null : el\.value/, `${f} 下拉的「沒有」是移出`);
    assert.match(m, /const go = l => l \? D\.assign\(id, ws, l\) : D\.unassign\(id, ws\)/, `${f} 一格寫 assign 或 unassign`);
    assert.match(m, /if \(!to && UI\.needAsk\(S, b, T\("confirm\.maRemove"/, `${f} 一次移出很多人要先問一次`);
    assert.match(m, /\(now\[id\] \|\| null\) !== to/, `${f} 已經是那一級的人不重寫`);
    assert.match(m, /S\.undo = /, `${f} 要有復原`);
    assert.match(d, /rpc\("workspace_members"/); assert.match(d, /rpc\("assign"/); assert.match(d, /rpc\("unassign"/);
    assert.match(d, /from\("profiles"\)\.select\("id, name_zh, name_en, board_role, team"\)/, `${f} 找人只讀名字、職級、team`);
    assert.match(m, /UI\.pkReduce\(S\.mp\.pk/, `${f} 勾選與打字走 pkReduce`);
    assert.match(m, /UI\.pkRefocus\(/, `${f} 打字重畫後游標要放回去`);
    assert.doesNotMatch(d, /person_email/, `${f} 不准讀 email`);
  }
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
  // 2026-11-14：整個 BT 的工具不跟擁有人勾的 team 走（Co-President 勾了 Sponsorship，紀錄就掉到 Sponsorship 那一列）。
  const pres = [{ profile_id: "p1", team: "Sponsorship Team" }];
  for (const id of ["custom:records", "records", "custom:meeting-templates", "custom:team-forms", "custom:website",
                    "custom:calendar", "custom:meetings", "custom:projects", "custom:forms", "custom:my-passport", "custom:venues"])
    assert.equal(FORMS.wsTeamOf({ id, owner: "p1" }, pres), "", `${id} 在整個 BT`);
  // 2027-01-24 Paul：「Money should be under sponsorship」；Internal 在 Senior 那一列。
  for (const id of ["custom:money", "finance"]) assert.equal(FORMS.wsTeamOf({ id, owner: "p1" }, pres), "Sponsorship Team", `${id} 在 Sponsorship`);
  assert.equal(FORMS.wsTeamOf({ id: "custom:internal" }), "Senior");
  assert.equal(FORMS.wsTeamOf({ id: "custom:marketing-requests", owner: "p1" }, pres), "Marketing Team");
  assert.equal(FORMS.wsCellLabel({ id: "passport" }), "幹部護照（格子與城市）");
  assert.equal(FORMS.wsCellLabel({ id: "intern-passport" }), "實習護照（格子與棋盤）");
  assert.equal(FORMS.wsCellLabel({ id: "apps:Curriculum Team" }), "申請（表單與審核）");
  assert.equal(FORMS.wsCellHref({ id: "apps:X" }), "/admin/#forms"); assert.equal(FORMS.wsCellHref({ id: "intern-passport" }), "/admin/passports/#interns");
  const rows = FORMS.wsRows([{ id: "passport" }, { id: "apps" }, { id: "intern-passport" }, { id: "res:Internship Team" }, { id: "custom:camp", team: "Internship Team" }], ["Curriculum Team", "Internship Team"]);
  assert.deepEqual(rows.map(r => [r.label, r.cells.map(c => c.id)]), [["整個 BT", ["apps", "passport"]], ["Senior", []], ["Curriculum", []], ["Internship", ["res:Internship Team", "intern-passport", "custom:camp"]]], "整個 BT 列：申請、幹部護照；Internship 列：資源、實習護照、自訂（2026-10-30 起申請不分 team）");
  assert.equal(FORMS.wsTeamOf({ id: "apps" }), ""); assert.equal(FORMS.wsCellLabel({ id: "apps" }), "申請（表單與審核）"); assert.equal(FORMS.wsCellHref({ id: "apps" }), "/admin/#forms");
  // 整個 BT 那一列：每天用的六樣在前面，跟側欄最上面同一個順序；Internal 在 Senior。
  const all = FORMS.wsRows(["custom:website", "apps", "custom:venues", "custom:calendar", "custom:my-passport", "custom:forms", "custom:projects", "custom:meetings", "custom:internal", "custom:money"].map(id => ({ id })), ["Sponsorship Team"]);
  assert.deepEqual(all.map(r => [r.team, r.cells.map(c => c.id)]), [
    ["", ["custom:calendar", "custom:meetings", "custom:projects", "custom:forms", "custom:my-passport", "custom:venues", "apps", "custom:website"]],
    ["Senior", ["custom:internal"]], ["Sponsorship Team", ["custom:money"]]]);
  assert.equal(FORMS.wsCellHref({ id: "custom:calendar" }), "/home/#calendar");
  assert.equal(FORMS.wsCellHref({ id: "custom:my-passport" }), "/passport/");
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

// 2026-11-06 自動儲存（Paul：「每一格都像 Workspaces 那一頁一樣，改了就存」）。
// 表單設定與既有的題沒有「存起來」那顆鈕了，容器標 data-autosave、每一格有 name；會丟東西、會建立新東西的還是鈕。
test("★ 自動儲存：表單設定與既有的題改了就存，刪表單、加新題、開新表單還是鈕", () => {
  const f = FORMS.formHTML(AF, [], true, ["Curriculum Team"], "", false);
  assert.match(f, /<div data-autosave="save-form" data-id="f1">/);
  assert.match(f, /class="autosave" data-for="save-form"/); assert.doesNotMatch(f, /data-act="save-form"/);
  for (const n of ["title", "intro", "kind", "lang", "opens_at", "closes_at", "notify_by", "interview_url", "status", "team"]) assert.match(f, new RegExp(` name="${n}"`), `設定少了 name="${n}"`);
  assert.match(f, /data-act="del-form"/, "刪掉這份表單還是鈕");
  assert.doesNotMatch(FORMS.formHTML(AF, [], false, [], "", false), /class="autosave"/, "唯讀的沒有那行小字");
  // 2026-11-13 起題目是畫布（shared/forms.js）：每一塊各自是 data-autosave="q-save"，打完就存；加新題是「＋」選單，不是按鈕頁。
  const q = { id: "q1", label: "為什麼想來", help: "", type: "long", required: true, options: [] };
  const edit = FORMS.formHTML(AF, [q], true, [], "", false);
  assert.match(edit, /data-autosave="q-save" data-id="q1"/); assert.match(edit, /class="autosave" data-for="q-save"/);
  for (const n of ["label", "help", "type", "required"]) assert.match(edit, new RegExp(` name="${n}"`), `題目少了 name="${n}"`);
  assert.match(edit, /data-act="fx-menu"/, "加一題是「＋」選單");
  const m = readFileSync("admin/src/main.js", "utf8");
  assert.match(m, /UI\.bindAutosave\(root\(\), onAutosave\)/, "boot 掛一次");
  for (const act of ["save-form", "q-save", "rq-save", "ev-save", "mt-save"]) assert.match(m, new RegExp(`act === "${act}"`), `onAutosave 沒接 ${act}`);
  assert.doesNotMatch(m, /act === "rq-save" \|\| act === "rq-done"/, "rq-save 不再是按鈕");
  assert.match(m, /if \(patch\.status === "open" && S\.questions\.length === 0\) \{\s*const st = document\.getElementById\("fstatus"\)/, "沒題目不能開放那一關搬進 onAutosave，而且會把下拉撥回去");
});

// 2026-11-23 Google 日曆那一列：在 Google 上、送不上、沒建到、不在 Google 上四種；欄位不在就不畫。
test("★ 後台會議頁的 Google 日曆那一列", () => {
  const base = { id: "m1", scope: "board", title: "遊戲夜", starts_at: "2099-01-01T12:00:00Z", ends_at: "2099-01-01T13:00:00Z" };
  assert.equal(FORMS.gcalRowHTML(base, true, false), "", "舊資料庫沒有那幾欄就不畫");
  const on = FORMS.gcalRowHTML({ ...base, gcal_event_id: "e1", gcal_error: null, meet_url: "https://meet.google.com/x", gcal_pulled_at: null }, true, false);
  assert.match(on, /https:\/\/meet\.google\.com\/x/); assert.match(on, /data-act="mt-gcal"/);
  const failed = FORMS.gcalRowHTML({ ...base, gcal_event_id: "e1", gcal_error: "HTTP 500: <b>x</b>" }, true, false);
  assert.match(failed, /class="tag warn"/); assert.match(failed, /&lt;b&gt;x&lt;\/b&gt;/, "原因要跳脫");
  const never = FORMS.gcalRowHTML({ ...base, gcal_event_id: null, gcal_error: "timeout" }, true, false);
  assert.doesNotMatch(never, /data-act="mt-gcal"/, "沒有 Google 事件就不給再送一次");
  assert.doesNotMatch(FORMS.gcalRowHTML({ ...base, gcal_event_id: "e1", gcal_error: null }, false, false), /data-act="mt-gcal"/, "改不了這場的人沒有那顆鈕");
});

// 2026-11-14 Paul：「I still want the left menu click and show all the stuff in that tab like before」。
// 現在這一區在側欄裡展開，列出它底下的每一頁；那一區本身是淺底（here），深藍的是現在這一頁。
test("★ 側欄：現在這一區展開成它的每一頁，現在這一頁有標記，只有一頁的不展開", () => {
  for (const [label, M] of IMPL) {
    const pres = { role: "cadre", board: "president", team: "Sponsorship Team", name: "P", ws: {} };
    const rail = M.railHTML("records", "people", pres, {}, "en");
    assert.match(rail, /<a class="rail-item rail-area here" href="#overview"[^>]*>.*?<b>紀錄<\/b>.*?<\/a><div class="rail-subs">/, label);
    assert.match(rail, /rail-sub" href="#overview" data-act="tab" data-t="overview">活動</, label);
    assert.match(rail, /rail-sub on" href="#people" data-act="tab" data-t="people" aria-current="page">人</, label);
    assert.doesNotMatch(rail, /rail-people|#members=/, `${label}：2026-11-25 Co-President 的側欄沒有「誰在這裡」`);
    assert.match(M.railHTML("records", "people", { role: "cadre", board: "director", team: "", name: "D", ws: { records: "edit", "custom:records": "manage" } }, {}, "en"),
      /rail-sub rail-people" href="\/admin\/\?lang=zh#members=custom%3Arecords"/, `${label}：只管這一區的人照舊有`);
    assert.equal((rail.match(/rail-subs/g) || []).length, 1, `${label}：只有現在這一區展開`);
    // 只有場地（沒被派進紀錄）：紀錄那一行只有一頁，不展開，那一行自己深藍。
    const one = M.railHTML("forms", "venues", { role: "cadre", board: "member", team: "Curriculum Team", ws: DAY }, {}, "zh");
    assert.doesNotMatch(one, /rail-subs/, label);
    assert.match(one, /rail-area on"/, label);
  }
});
