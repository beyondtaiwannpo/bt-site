// 實習護照（/intern-passport/，2026-10-17，方案 C）的純函式契約。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATEGORY, CATNAME, SLOT_ORDER, stampCount, pagesOf, barHTML, idPageHTML, catPageHTML,
         slotHTML, wallHTML, setupHTML, guidePageHTML, namesOf, setLang, T } from "../intern-passport/src/ui.js";
// 實習護照 2026-10-19 起有中英切換，字典預設英文；這一支斷言的是中文，所以先切成中文。
setLang("zh");
import { passportNo } from "../intern-passport/src/data.js";
import { FEATURES, featuresFor } from "../shared/nav.js";
import { NEXT } from "../app/src/nav.js";
import { inviteFormHTML, inviteCodesHTML, setLang as peopleLang } from "../admin/people/src/ui.js";
// 後台 2026-10-19 起有中英切換，字典預設英文；這一支斷言的是中文，所以先切成中文。
peopleLang("zh");
import { internshipStaff } from "../settings/src/ui.js";

const TASKS = [
  { id: "T2627-01", category: "onboard", seq: 1, title_zh: "認識 BT", title_en: "MEET BT", description: "看介紹" },
  { id: "T2627-02", category: "onboard", seq: 2, title_zh: "第一次會議", title_en: "FIRST MEETING", description: "開會" },
  { id: "T2627-04", category: "project", seq: 4, title_zh: "第一個任務", title_en: "FIRST TASK", description: "交出去" },
  { id: "T2627-07", category: "reflect", seq: 7, title_zh: "我為什麼來", title_en: "WHY I CAME", description: "三句話" },
];
const PROFILE = { id: "00000000-0000-0000-0000-000000000000", name_zh: "王小明", name_en: "Ming Wang",
                  avatar: null, motto: "想帶走一件事", issued: "2026-10-01", term: "2026-27" };
const TERM = { id: "2026-27", title_zh: "2026-27 實習", title_en: "INTERNSHIP 2026-27" };
const S0 = () => ({ profile: PROFILE, term: TERM, tasks: TASKS, stamps: {}, entries: {},
                    page: 0, view: "passport", flipped: {}, staff: false });

test("三種分類的順序與定義只有一份，CATNAME 從 CATEGORY 衍生", () => {
  assert.deepEqual(SLOT_ORDER, ["onboard", "project", "reflect"]);
  assert.deepEqual(Object.keys(CATNAME).sort(), SLOT_ORDER.slice().sort());
  for (const c of SLOT_ORDER) {
    assert.ok(T(CATEGORY[c].label) && T(CATEGORY[c].zh) && T(CATEGORY[c].body), `${c} 少了文案`);
    assert.doesNotMatch(T(CATEGORY[c].body), /待補/, `${c} 的文案還是佔位字`);
  }
});

// ★ 分類的三個值要跟資料庫的 check constraint 一樣，不然後台改了分類、前端畫面上那格會消失不會報錯。
test("★ 前端的三個分類跟 intern_tasks 的 check 一字不差", () => {
  const sql = readFileSync("supabase/migrations/2026-10-17-intern-passport.sql", "utf8");
  const m = sql.match(/category\s+text not null check \(category in \(([^)]+)\)\)/);
  assert.ok(m, "遷移檔裡找不到 category 的 check");
  const db = m[1].split(",").map(x => x.trim().replace(/'/g, "")).sort();
  assert.deepEqual(db, SLOT_ORDER.slice().sort());
});

test("頁序：資料頁、說明頁，然後只畫有格子的分類", () => {
  const pages = pagesOf(S0());
  assert.deepEqual(pages.map(p => p.kind), ["id", "guide", "cat", "cat", "cat"]);
  assert.deepEqual(pages.filter(p => p.kind === "cat").map(p => p.cat), ["onboard", "project", "reflect"]);
  const S = S0(); S.tasks = TASKS.filter(t => t.category !== "project");
  assert.deepEqual(pagesOf(S).filter(p => p.kind === "cat").map(p => p.cat), ["onboard", "reflect"]);
});

// 認不得的分類排到最後、不丟掉：錯誤要是「順序不對」，不是「格子消失」。
test("★ 認不得的分類還是有一頁，排在最後", () => {
  const S = S0(); S.tasks = [...TASKS, { id: "T2627-99", category: "mystery", seq: 99, title_zh: "？", title_en: "?", description: "" }];
  const cats = pagesOf(S).filter(p => p.kind === "cat").map(p => p.cat);
  assert.deepEqual(cats, ["onboard", "project", "reflect", "mystery"]);
  assert.ok(catPageHTML(S, "mystery").includes("T2627-99"), "認不得的分類那一頁沒有畫出格子");
});

test("頂欄的數字等於 stampCount，而且分母是格子總數", () => {
  const S = S0(); S.stamps = { "T2627-01": { date: "2026-10-01" }, "T2627-04": { date: "2026-10-02" } };
  const shown = barHTML(S).match(/<\/small>(\d+) <span[^>]*>\/ (\d+)/);
  assert.ok(shown);
  assert.equal(Number(shown[1]), stampCount(S));
  assert.equal(Number(shown[2]), TASKS.length);
});

test("★ FULL 疊印：蓋滿才出現，沒有格子時不算蓋滿", () => {
  const full = S0(); TASKS.forEach(t => { full.stamps[t.id] = { date: "2026-10-01" }; });
  assert.ok(idPageHTML(full).includes("FULL"));
  const none = S0(); none.tasks = [];
  assert.ok(!idPageHTML(none).includes("FULL"), "0 / 0 被當成 FULL");
  assert.ok(!idPageHTML(S0()).includes("FULL"));
});

test("資料頁有屆別、護照號碼用 IN 開頭、沒有機讀碼", () => {
  const h = idPageHTML(S0());
  assert.ok(h.includes("2026-27 實習"));
  assert.match(h, /IN\d{7}/);
  assert.ok(!h.includes("mrz"), "實習護照不該有機讀碼");
  assert.ok(!h.includes("匯出備份") && !h.includes("清除這本護照"), "第一版刻意不做匯出與清除");
});

test("護照號碼由 id 決定、固定不變、跟幹部護照的前綴不同", () => {
  assert.equal(passportNo("abc"), passportNo("abc"));
  assert.notEqual(passportNo("abc"), passportNo("abd"));
  assert.match(passportNo("abc"), /^IN\d{7}$/);
});

test("未蓋章的格子沒有背面，蓋了章才有章與翻面鈕", () => {
  const S = S0();
  const before = slotHTML(S, TASKS[0]);
  assert.ok(!before.includes('class="face back"'));
  assert.ok(before.includes("蓋章 →"));
  S.stamps["T2627-01"] = { date: "2026-10-01" }; S.entries["T2627-01"] = { note: "緊張", photo: null };
  const after = slotHTML(S, TASKS[0]);
  assert.ok(after.includes('class="face back"'));
  assert.ok(after.includes("2026.10.01"));
  assert.ok(after.includes("緊張"));
  assert.ok(after.includes('data-act="flip"'));
  assert.ok(!after.includes("undefined"));
});

test("★ 進度牆：每個分類一格、沒有心得、有說明誰看得到", () => {
  const S = S0();
  S.wall = [
    { id: "a", name_zh: "實習一號", name_en: "", avatar: null,
      intern_stamps: [{ task_id: "T2627-01", stamped_on: "2026-10-01" }] },
    { id: "b", name_zh: "實習二號", name_en: "Two", avatar: null, intern_stamps: [] },
  ];
  const h = wallHTML(S);
  assert.ok(h.includes("實習一號") && h.includes("實習二號"));
  assert.ok(h.includes("Internship team 的幹部與這一期的 intern 看得到"));
  assert.equal((h.match(/<i data-on=/g) || []).length, 2 * 3, "每個人該有三格（三個分類）");
  assert.ok(h.includes("蓋了 <b>認識 BT</b>"));
  assert.ok(!h.includes("intern_entries") && !h.includes('class="note"'), "牆上不該有心得");
});

test("Internship team 的幹部有進度牆與樣書，沒有「我的護照」", () => {
  const S = S0(); S.staff = true;
  const h = barHTML(S);
  assert.ok(h.includes("實習生進度牆"));
  assert.ok(h.includes('data-v="sample"'));
  assert.ok(!h.includes('data-v="passport"'));
  assert.ok(!h.includes("Stamps collected"));
});

test("領護照的表單沒有 team 那一格，而且說清楚誰看得到什麼", () => {
  const h = setupHTML({}, { id: "u" });
  assert.ok(!h.includes('id="ft"'), "實習生不屬於任何 team，不該有 team 選單");
  assert.ok(h.includes("誰都看不到"));
  assert.ok(h.includes("領護照"));
  // 2026-11-06 自動儲存：有名字之後再開這張表單，沒有「儲存」鈕，欄位在 data-autosave 容器裡、旁邊是「改了就存」的小字。
  const e = setupHTML(PROFILE, { id: "u" });
  assert.match(e, /data-autosave="issue"/);
  assert.match(e, /class="autosave" data-for="issue"/);
  assert.equal(/data-act="issue"/.test(e), false, "編輯模式不該還有那顆鈕");
  assert.ok(e.includes("回到護照"));
});

test("說明頁三張卡照 SLOT_ORDER，而且講了隱私界線", () => {
  const h = guidePageHTML();
  assert.ok(h.includes("心得與照片只有你看得到"));
  assert.equal((h.match(/class="slot"/g) || []).length, 3);
});

test("namesOf 跟幹部護照同一份規則", () => {
  assert.deepEqual(namesOf({ name_zh: "王小明", name_en: "Ming" }), { name: "王小明", alt: "Ming" });
  assert.deepEqual(namesOf({ name_zh: "", name_en: "Ming" }), { name: "Ming", alt: "" });
  assert.deepEqual(namesOf({}), { name: "（沒有名字）", alt: "" });
});

// ── 接線：頂欄、登入後的 next、後台發碼、設定頁 ──────────────────────
test("★ 實習生的頂欄只有實習護照與設定，幹部的頂欄沒有實習護照", () => {
  assert.deepEqual(featuresFor("intern").map(f => f.key).sort(), ["intern-passport", "settings"]);
  assert.ok(!featuresFor("cadre").some(f => f.key === "intern-passport"),
    "cadre 的頂欄多了實習護照：五個 team 的幹部會多一個點了被彈回來的入口");
  assert.ok(!featuresFor("student").some(f => f.key === "intern-passport"));
  assert.ok(!featuresFor("alumni").some(f => f.key === "intern-passport"));
  const f = FEATURES.find(x => x.key === "intern-passport");
  assert.equal(f.href, "/intern-passport/");
});

test("沒登入直接打 /intern-passport/ 會被帶去登入，登入完回得來（next 白名單）", () => {
  assert.equal(NEXT["intern-passport"], "../intern-passport/");
  const src = readFileSync("intern-passport/src/main.js", "utf8");
  assert.ok(src.includes('location.replace("../app/?next=intern-passport")'));
});

test("★ 登入頁認得 intern：直接送去實習護照，不走學員補資料那條路", () => {
  const src = readFileSync("app/src/main.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.match(src, /S\.role === "intern"[\s\S]{0,200}location\.replace\("\.\.\/intern-passport\/"\)/);
  assert.match(src, /S\.role !== "cadre" && S\.role !== "intern"\) await loadStudentBits/);
});

test("後台發碼多了實習生碼，清單上的標籤也認得", () => {
  const form = inviteFormHTML({ code: "bt-x", grants: "intern", uses: 1, note: "" }, false);
  assert.match(form, /<option value="intern" selected>實習生碼/);
  assert.match(inviteFormHTML({}, false), /<option value="cadre" selected>/);
  const list = inviteCodesHTML([{ code: "BT-INT", grants: "intern", uses_left: 2, note: null, created_at: null,
    uses: [{ name: "實習一號", email: "i@example.com", role: "intern", grants: "intern", used_at: "2026-10-17T00:00:00Z" }] }], "");
  assert.match(list, /實習生碼/);
  assert.match(list, /換成實習生/);
  assert.doesNotMatch(list, /現在是/);
});

test("★ 設定頁：誰看得到實習生進度牆的入口，跟資料庫的 is_internship_team() 同一條規則（2026-10-24 起看指派）", () => {
  assert.equal(internshipStaff({ role: "cadre", team: "Curriculum Team, Internship Team", board_role: "member" }), false, "只勾了標籤沒有指派，看不到");
  assert.equal(internshipStaff({ role: "cadre", team: "", board_role: "member", ws: { "intern-passport": "view" } }), true);
  assert.equal(internshipStaff({ role: "cadre", team: "Marketing Team", board_role: "president" }), true);
  assert.equal(internshipStaff({ role: "cadre", team: "Marketing Team", board_role: "senior_adviser" }), true);
  assert.equal(internshipStaff({ role: "cadre", team: "Marketing Team", board_role: "member" }), false);
  assert.equal(internshipStaff({ role: "student", team: "Internship Team", board_role: "member", ws: { "intern-passport": "edit" } }), false,
    "學員不能因此看到進度牆");
  assert.equal(internshipStaff({ role: "intern", team: null, board_role: "member" }), false);
});

// 兩份護照程式刻意分開：實習護照不准 import 幹部護照的任何東西，反過來也不准。
test("★ /intern-passport/ 與 /passport/ 互不 import", () => {
  for (const f of ["intern-passport/src/data.js", "intern-passport/src/ui.js", "intern-passport/src/main.js"])
    assert.ok(!/^\s*import .*\/passport\//m.test(readFileSync(f, "utf8")), `${f} import 了幹部護照`);
  for (const f of ["passport/src/data.js", "passport/src/ui.js", "passport/src/main.js"])
    assert.ok(!/intern-passport/.test(readFileSync(f, "utf8")), `${f} 碰到了實習護照`);
});

// 資料層只碰 intern_* 五張表與 profiles。碰到幹部護照的表就是方案 C 破功。
test("★ 實習護照的資料層不碰幹部護照的任何一張表", () => {
  const src = readFileSync("intern-passport/src/data.js", "utf8").replace(/\/\/[^\n]*/g, "");
  const tables = [...src.matchAll(/\.from\("([a-z_]+)"\)/g)].map(m => m[1]);
  // 2026-10-22 蛇梯棋加了 intern_boards 與 intern_squares（只讀）；擲骰與位置走 rpc，不碰表。2026-11-14 加 intern_groups（分類，只讀）。
  const allowed = new Set(["intern_terms", "intern_tasks", "intern_passports", "intern_stamps", "intern_entries", "profiles", "intern_boards", "intern_squares", "intern_groups"]);
  for (const t of tables) assert.ok(allowed.has(t), `data.js 碰了 ${t}`);
  assert.ok(!/\.update\(\{[^}]*updated_at/.test(src), "intern_passports 只發了 motto 一欄的權限，送 updated_at 整句會被拒");
});
