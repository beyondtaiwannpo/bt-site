// 免費資源的大標（2027-01-13-resource-sections.sql）。跑法：node --test test/resource-sections.test.mjs
// Paul 2026-11-25：「at the backstage you can just let us name what resources, the big heading is… I'm trying to rename
// resources into maybe, I don't know, college intro, mentee mentor story, and stuff like that.」
// 這一支守三件事：對外頁怎麼分組（純函式）、遷移檔還沒跑的時候兩邊都不會壞、連結（url）還是只有登入的人讀得到。
// 真的在資料庫上跑起來對不對由 scripts/db/smoke.sh 最後一段守。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../resources/src/ui.js";
import * as RM from "../resources/src/main.js";
import * as M from "../admin/site/src/ui.js";
import * as D from "../admin/site/src/data.js";
import { STRINGS as STR } from "../admin/site/src/strings.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const FILE = "supabase/migrations/2027-01-13-resource-sections.sql";
const sql = read(FILE);
const code = sql.replace(/--[^\n]*/g, "");

const secs = [
  { id: "bbbbbbbb-0000-0000-0000-000000000002", name_zh: "Mentee 與 Mentor 的故事", name_en: "", ord: 20 },
  { id: "aaaaaaaa-0000-0000-0000-000000000001", name_zh: "大學介紹", name_en: "College intro", ord: 10 },
  { id: "cccccccc-0000-0000-0000-000000000003", name_zh: "還沒有東西的大標", name_en: "Empty", ord: 1 },
];
const A = secs[1].id, B = secs[0].id;
const items = [
  { id: "1", kind: "pdf", title: "Resources Book", blurb: "一句介紹", ord: 100, section_id: A, url: "https://drive.google.com/x" },
  { id: "2", kind: "video", title: "學長姐的故事", ord: 50, section_id: B },
  { id: "3", kind: "link", title: "還沒分的", ord: 10, section_id: null },
  { id: "4", kind: "pdf", title: "同一個大標裡排前面的", ord: 5, section_id: A },
  { id: "5", kind: "pdf", title: "指到一個已經刪掉的大標", ord: 1, section_id: "dddddddd-0000-0000-0000-000000000004" },
];

// ── 對外頁：分組 ──────────────────────────────────────────────────────
test("分組：大標照排序、裡面的資源照自己的排序，沒有資源的大標不出現，沒分的在最後", () => {
  const g = R.groupBySection(items, secs);
  assert.deepEqual(g.map(x => x.section ? x.section.name_zh : null), ["大學介紹", "Mentee 與 Mentor 的故事", null]);
  assert.deepEqual(g[0].items.map(r => r.id), ["4", "1"]);
  assert.deepEqual(g[1].items.map(r => r.id), ["2"]);
  assert.deepEqual(g[2].items.map(r => r.id), ["5", "3"], "指到已經不在的大標的那一筆不會消失，跟沒分的放一起");
});

test("分組：排序一樣的大標照名字，排序一樣的資源維持原本的先後；不改到傳進來的陣列", () => {
  const same = [{ id: "y", name_zh: "B 開頭的", ord: 10 }, { id: "x", name_zh: "A 開頭的", ord: 10 }];
  const rows = [{ id: "r1", ord: 100, section_id: "x" }, { id: "r2", ord: 100, section_id: "x" }, { id: "r3", ord: 100, section_id: "y" }];
  const before = JSON.stringify([same, rows]);
  const g = R.groupBySection(rows, same);
  assert.deepEqual(g.map(x => x.section.id), ["x", "y"]);
  assert.deepEqual(g[0].items.map(r => r.id), ["r1", "r2"]);
  assert.equal(JSON.stringify([same, rows]), before);
});

test("★ 一個大標都沒有：整頁跟原本一樣，一塊「資源」，裡面就是原本那一排", () => {
  const flat = items.map(r => ({ ...r, section_id: null }));
  for (const sections of [[], null, undefined]) {
    const h = R.pageHTML(flat, sections, false, false);
    assert.equal((h.match(/<section class="sec"/g) || []).length, 1);
    assert.match(h, /<h2><span class="zh">資源<\/span><span class="en">Resources<\/span><\/h2>/);
    assert.ok(h.includes(R.listHTML(flat.slice().sort((a, b) => a.ord - b.ord), false, false).trim().split("\n").pop().trim()), "那一排資源跟 listHTML 畫的一樣");
    assert.doesNotMatch(h, /id="s-/);
  }
  // 讀到了 section_id 但大標那張表讀不到（或一時連不上）：一樣是一整排，一筆都不少
  const h = R.pageHTML(items, [], false, false);
  assert.equal((h.match(/<section class="sec"/g) || []).length, 1);
  for (const r of items) assert.ok(h.includes(r.title), r.title);
});

test("有大標：一個大標一塊，大標是 h2，每一塊有錨點；「要先登入」只出現一次，在第一塊", () => {
  const h = R.pageHTML(items, secs, false, false);
  assert.equal((h.match(/<section class="sec"/g) || []).length, 3);
  assert.deepEqual([...h.matchAll(/<h2>(.*?)<\/h2>/g)].map(m => m[1]),
    ["大學介紹", "Mentee 與 Mentor 的故事", `<span class="zh">資源</span><span class="en">Resources</span>`]);
  assert.match(h, /<section class="sec" id="s-aaaaaaaa">/);
  assert.match(h, /<section class="sec" id="s-bbbbbbbb">/);
  assert.equal((h.match(/這些東西是免費的/g) || []).length, 1);
  assert.ok(h.indexOf("這些東西是免費的") < h.indexOf("Mentee 與 Mentor 的故事"), "在第一塊裡");
  assert.doesNotMatch(h, /還沒有東西的大標/, "底下沒有資源的大標不畫");
  assert.doesNotMatch(R.pageHTML(items, secs, true, false), /這些東西是免費的/, "已經登入就不勸他登入");
});

test("英文版用英文名，沒填英文名就用中文名", () => {
  const h = R.pageHTML(items, secs, false, true);
  assert.match(h, /<h2>College intro<\/h2>/);
  assert.match(h, /<h2>Mentee 與 Mentor 的故事<\/h2>/);
  assert.doesNotMatch(h, /<h2>大學介紹<\/h2>/);
  assert.equal(R.sectionName({ name_zh: "甲", name_en: "  " }, true), "甲");
});

test("★ 沒登入：分了大標之後連結還是不在畫面上；登入了才有", () => {
  assert.ok(!R.pageHTML(items, secs, false, false).includes("drive.google.com"));
  assert.match(R.pageHTML(items, secs, true, false), /href="https:\/\/drive\.google\.com\/x"/);
});

test("什麼都沒有：一塊「資源」加那一句話；連不上資料庫：一塊「資源」加錯誤那一句", () => {
  assert.match(R.pageHTML([], secs, false, false), /<h2><span class="zh">資源<\/span>[\s\S]*還沒有放上來的東西/);
  assert.match(R.errorPageHTML("現在連不上資料庫"), /<h2><span class="zh">資源<\/span>[\s\S]*class="warn">現在連不上資料庫/);
});

test("跳脫：大標的名字是人打的字", () => {
  const h = R.pageHTML([{ id: "1", kind: "pdf", title: "x", ord: 1, section_id: "s" }], [{ id: "s", name_zh: "<img src=x onerror=1>", ord: 1 }], false, false);
  assert.ok(!h.includes("<img src=x"));
  assert.match(R.sectionAnchor('ab"><script>'), /^s-[0-9a-z]*$/);
});

// ── 對外頁：兩份欄位清單與退路 ────────────────────────────────────────
test("★ 沒登入那一份欄位清單沒有 url，多的只有 section_id；兩份清單還是分開的", () => {
  const src = read("resources/src/main.js");
  const pub = src.match(/const PUBLIC_COLS = "([^"]*)"/)[1], mem = src.match(/const MEMBER_COLS = "([^"]*)"/)[1];
  assert.equal(pub, "id, title, blurb, kind, ord");
  assert.ok(!/\burl\b/.test(pub), "沒登入的那一份不准有 url");
  assert.equal(mem, "id, title, blurb, kind, ord, url");
  assert.equal(src.match(/const SECTION_COL = "([^"]*)"/)[1], ", section_id");
  assert.match(src, /const base = signedIn \? MEMBER_COLS : PUBLIC_COLS;/);
});

test("★ 遷移檔還沒跑（section_id 那一欄不存在）：退回原本那一份再問一次，沒登入的退路一樣沒有 url", async () => {
  for (const signedIn of [false, true]) {
    const asked = [];
    const ask = async cols => { asked.push(cols); return cols.includes("section_id") ? { data: null, error: { code: "42703" } } : { data: [{ id: "1" }], error: null }; };
    assert.deepEqual(await RM.loadResources(signedIn, ask), [{ id: "1" }]);
    assert.equal(asked.length, 2);
    assert.match(asked[0], /, section_id$/);
    assert.equal(asked[1].includes("section_id"), false);
    assert.equal(/\burl\b/.test(asked[0]) || /\burl\b/.test(asked[1]), signedIn, "url 只在登入的那一份");
  }
});

test("那一欄在的時候只問一次；兩次都失敗才算失敗（畫面講連不上資料庫）", async () => {
  let n = 0;
  assert.deepEqual(await RM.loadResources(false, async () => { n++; return { data: [{ id: "9", section_id: null }], error: null }; }), [{ id: "9", section_id: null }]);
  assert.equal(n, 1);
  await assert.rejects(RM.loadResources(false, async () => ({ data: null, error: new Error("down") })), /down/);
});

test("★ 大標讀不到（那張表還不在、或連不上）：當作沒有大標，不擋資源", async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    assert.deepEqual(await RM.loadSections(async () => ({ data: null, error: { code: "PGRST205" } })), []);
    assert.deepEqual(await RM.loadSections(async () => { throw new Error("network"); }), []);
  } finally { console.warn = warn; }
  assert.deepEqual(await RM.loadSections(async () => ({ data: [secs[0]], error: null })), [secs[0]]);
});

test("對外頁的 HTML 沒有改結構（快取裡的舊程式照樣畫得對）；新程式第一次畫的時候把那一整塊換掉", () => {
  const h = read("resources/index.html");
  assert.match(h, /<section class="sec">\s*<div class="sec-in">\s*<h2><span class="zh">資源<\/span><span class="en">Resources<\/span><\/h2>\s*<div class="body"><div id="rs-root"><div class="loading">/);
  assert.equal((h.match(/id="rs-root"/g) || []).length, 1);
  const src = read("resources/src/main.js");
  assert.match(src, /const host = el\.closest\("section\.sec"\);/);
  assert.match(src, /host\.replaceWith\(box\);/);
});

// ── 後台 ──────────────────────────────────────────────────────────────
const bsecs = { rows: [secs[1], secs[0]], missing: false, canManage: true };
const bitems = items.map(r => ({ ...r, url: r.url || "https://x", status: "published" }));

test("後台清單：管得了的人看得到每個大標一列（中文名、英文名、排序、刪掉）與加一個", () => {
  M.setLang("zh");
  const h = M.resListHTML(bitems, true, "", true, [], bsecs, false);
  assert.match(h, /<h2>大標<\/h2>/);
  assert.equal((h.match(/data-autosave="rsec-save"/g) || []).length, 2);
  for (const n of ["name_zh", "name_en", "ord"]) assert.match(h, new RegExp(`data-autosave="rsec-save" data-id="${A}">[\\s\\S]*?name="${n}"`), n);
  assert.match(h, new RegExp(`data-act="rsec-del" data-id="${A}"`));
  assert.match(h, /id="rsec-new-zh"[\s\S]*id="rsec-new-en"[\s\S]*id="rsec-new-ord"[\s\S]*data-act="rsec-add"/);
  assert.match(h, /底下 2 筆資源/);
  assert.match(h, /<span class="tag">大學介紹<\/span>/, "清單上每一筆印它在哪一個大標");
  assert.equal(M.rsecNextOrd(bsecs.rows), 30); assert.equal(M.rsecNextOrd([]), 10);
});

test("★ 後台清單：管不了的人只看得到大標的名字，沒有任何一格可以打、沒有按鈕", () => {
  M.setLang("zh");
  const h = M.resSectionsHTML({ ...bsecs, canManage: false }, bitems, false);
  assert.match(h, /大學介紹/);
  assert.doesNotMatch(h, /<input|data-act="rsec-|data-autosave/);
  assert.match(h, /Co-President、Senior Adviser/);
});

test("★ 遷移檔還沒跑：那一塊只印一句要先跑哪一支，資源清單照舊；沒給大標的舊呼叫方式整塊不畫", () => {
  M.setLang("zh");
  const h = M.resListHTML(bitems, true, "", true, [], { rows: [], missing: true, canManage: false }, false);
  assert.match(h, /2027-01-13-resource-sections\.sql/);
  assert.doesNotMatch(h, /data-act="rsec-add"|data-autosave="rsec-save"/);
  assert.match(h, /data-act="res-edit" data-id="1"/);
  assert.doesNotMatch(M.resListHTML(bitems, true, ""), /rsec-|<h2>大標|class="tag">大學介紹/);
  M.setLang("en");
  assert.match(M.resSectionsHTML({ rows: [], missing: true }, []), /Run <code>2027-01-13-resource-sections\.sql<\/code>/);
  M.setLang("zh");
});

test("編輯頁：有大標才有那一格，選到的是這一筆現在的大標；沒有大標或遷移檔還沒跑，表單跟原本一樣", () => {
  M.setLang("zh");
  const h = M.resEditHTML(bitems[0], "", false, bsecs);
  assert.match(h, /<select id="rsection" name="section_id">/);
  assert.match(h, /<option value="">不分（放在「資源」底下）<\/option>/);
  assert.match(h, new RegExp(`<option value="${A}" selected>大學介紹</option>`));
  assert.ok(h.indexOf('name="section_id"') > h.indexOf('data-autosave="res-save"'), "在自動儲存的框裡");
  assert.match(M.resEditHTML(null, "", false, bsecs), /<select id="rsection" name="section_id">/, "新的一筆也選得了");
  for (const s of [undefined, null, { rows: [], missing: true }, { rows: [], missing: false, canManage: true }]) {
    assert.doesNotMatch(M.resEditHTML(bitems[0], "", false, s), /name="section_id"/);
  }
  assert.equal(M.resEditHTML(bitems[0], "", false), M.resEditHTML(bitems[0], "", false, { rows: [], missing: true }));
});

test("資料層：section_id 在存資源的欄位裡；「還沒跑」認得出來，講得出要跑哪一支", () => {
  const src = read("admin/site/src/data.js");
  assert.match(src, /const RES_FIELDS = \[[^\]]*"section_id"\]/);
  for (const c of ["42703", "42P01", "PGRST202", "PGRST204", "PGRST205"]) assert.equal(D.notMigrated({ code: c }), true, c);
  assert.equal(D.notMigrated({ code: "PGRST202", message: "Could not find the function public.save_resource_section" }), true);
  assert.equal(D.notMigrated({ message: "column resources.section_id does not exist" }), true);
  for (const e of [{ code: "42501", message: "permission denied for table resources" }, { code: "P0001", message: "not_section_manager" }, new Error("Failed to fetch"), null]) assert.equal(D.notMigrated(e), false);
  M.setLang("zh");
  assert.match(D.says(new Error("sections_not_migrated")), /2027-01-13-resource-sections\.sql/);
  assert.match(D.says({ message: "not_section_manager" }), /Co-President、Senior Adviser/);
  for (const c of ["section_name_required", "section_name_too_long", "too_many_sections", "no_such_section"]) assert.notEqual(D.says({ message: c }), c, c);
  // 加、改、刪都走資料庫的函式，不直接寫那張表
  assert.match(src, /rpc\("save_resource_section"/); assert.match(src, /rpc\("delete_resource_section"/);
  assert.doesNotMatch(src, /from\("resource_sections"\)\.(insert|update|delete|upsert)/);
});

test("字：新加的每一個鍵中英都有，沒有 emoji 也沒有破折號", () => {
  const keys = Object.keys(STR).filter(k => /^rsec\.|^(msg|err)\.rsec|^confirm\.delRsec$|^res\.(section|noSection)$/.test(k));
  assert.ok(keys.length >= 20, "找到 " + keys.length + " 個");
  for (const k of keys) {
    assert.ok(STR[k].zh && STR[k].en, k);
    assert.doesNotMatch(STR[k].zh + STR[k].en, /[—–]|\p{Extended_Pictographic}/u, k);
  }
});

// ── 遷移檔不准做的事 ──────────────────────────────────────────────────
test("★ 遷移檔：發給沒登入的人的只有 section_id 一欄，url 不在任何一句 grant 裡", () => {
  const grants = code.split(";").map(s => s.trim()).filter(s => /^grant\b/i.test(s) && /\banon\b/.test(s));
  assert.deepEqual(grants.sort(), [
    "grant select (section_id) on public.resources to anon",
    "grant select on public.resource_sections to anon, authenticated",
  ]);
  assert.doesNotMatch(code.slice(0, code.indexOf("commit;")), /grant[^;]*\burl\b/i);
  assert.match(code, /not has_column_privilege\('anon', 'public\.resources', 'url', 'select'\) as url_hidden/, "驗收表會驗一次");
});

test("遷移檔：resources 的政策一條都沒動，大標那張表只有一條讀的政策，寫只走函式", () => {
  assert.doesNotMatch(code, /policy\s+\w+\s+on\s+public\.resources\b/i);
  assert.deepEqual([...code.matchAll(/create policy (\w+) on public\.(\w+) for (\w+)/g)].map(m => m.slice(1).join(" ")), ["rsec_read resource_sections select"]);
  assert.match(code, /revoke all on public\.resource_sections from public, anon, authenticated;/);
  assert.doesNotMatch(code, /grant\s+(insert|update|delete|all)[^;]*resource_sections/i);
  assert.match(code, /section_id uuid references public\.resource_sections\(id\) on delete set null/);
  assert.doesNotMatch(code, /\b(delete from|update|truncate)\s+public\.resources\b/i, "不動任何一筆既有的資源");
  assert.doesNotMatch(code, /insert into public\.resource_sections/i, "不預先放大標");
});

test("遷移檔：加、改、刪都先過那道門，沒登入的人三支都叫不到；house style", () => {
  for (const fn of ["save_resource_section", "delete_resource_section"]) {
    const body = code.slice(code.indexOf("function public." + fn), code.indexOf("end $$;", code.indexOf("function public." + fn)));
    assert.match(body, /security definer\s+set search_path = public, pg_temp/);
    assert.match(body, /begin\s+if not public\.can_manage_resource_sections\(\) then raise exception 'not_section_manager'/, fn + " 第一句就是那道門");
  }
  assert.match(code, /select public\.is_senior\(\)\s+or exists \(select 1 from public\.workspaces w where w\.kind = 'res' and w\.active and public\.can_manage\(w\.id\)\)/);
  assert.equal((code.match(/revoke all on function public\.\w+\([^)]*\) from public, anon;/g) || []).length, 3);
  assert.equal((code.match(/^begin;$/gm) || []).length, 1); assert.equal((code.match(/^commit;$/gm) || []).length, 1);
  assert.match(code, /'OVERALL' as 項目/);
  assert.match(sql, /at the backstage you can just let us name what resources, the big heading is/);
  assert.match(sql, /要整個還原/);
  assert.doesNotMatch(code, /name_zh\s*=\s*'|profiles\.|auth\.users/, "不讀也不寫任何人的資料");
});

test("smoke.sh 有跑這一支（它的清單是寫死的，新增遷移檔要自己加）", () => {
  const smoke = read("scripts/db/smoke.sh");
  assert.match(smoke, /RSF=supabase\/migrations\/2027-01-13-resource-sections\.sql/);
  assert.match(smoke, /破壞測試：連結發給沒登入的人，驗收表變紅/);
  assert.match(smoke, /大標刪掉了，底下那一筆資源還在，變回沒有分/);
});
