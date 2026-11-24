// 創辦人（2026-11-24，supabase/migrations/2027-01-04-founders.sql）。跑法：node --test test/founders.test.mjs
// Paul：「add a Founder position so founders show up」；已經離開的創辦人也出現，但要本人同意。
// 這裡守的是三件事：只有本人勾得了同意、沒被標的人看不到任何東西、團隊頁那一支載不到不會把名單弄壞。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toPerson, withFounders, splitGroups, leadHeading, leadRank, LEAD_KEY } from "../team/src/ui.js";

const sql = readFileSync("supabase/migrations/2027-01-04-founders.sql", "utf8");
const fnBody = name => { const m = sql.match(new RegExp("create or replace function public\\." + name + "\\(([^)]*)\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;")); assert.ok(m, "找不到函式 " + name); return { args: m[1], body: m[2].replace(/--[^\n]*/g, "") }; };

test("★ 資料庫：同意只有本人勾得了，Co-President 只能標、替他勾不了", () => {
  const consent = fnBody("set_founder_consent"), mark = fnBody("set_founder");
  assert.equal(consent.args.trim(), "p_ok boolean", "同意那一支不准有「替誰勾」的參數");
  assert.match(consent.body, /where profile_id = auth\.uid\(\)/); assert.match(consent.body, /not_a_founder/);
  assert.match(mark.body, /is_president\(\)/); assert.match(mark.body, /not_president/);
  assert.doesNotMatch(mark.body, /consent/, "標記那一支不准碰同意");
  assert.match(mark.body, /founder_needs_account/, "沒有帳號的人標不了：沒有人能替他同意");
});
test("★ 資料庫：founders 表前端碰不到；沒登入叫得動的只有 public_founders，而且只回名字與大頭照", () => {
  assert.match(sql, /alter table public\.founders enable row level security;/);
  assert.match(sql, /revoke all on public\.founders from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy/);
  const anon = [...sql.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to ([^;]+);/g)].filter(m => /\banon\b/.test(m[2])).map(m => m[1]);
  assert.deepEqual(anon, ["public_founders"]);
  const pub = fnBody("public_founders");
  assert.match(sql, /function public\.public_founders\(\)\s+returns table \(id uuid, name_zh text, name_en text, avatar text\)/);
  assert.match(pub.body, /where f\.consent/); assert.match(pub.body, /p\.role in \('cadre', 'alumni'\)/);
  assert.doesNotMatch(pub.body, /email/);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ""), /create or replace function public\.public_team/, "這一支不改 public_team()：首頁、後台、島都在讀它");
});

test("★ 團隊頁：創辦人併進 Leadership，同一個人不會兩張卡", () => {
  const P = (id, name_en, team, title_en) => toPerson({ id, name_en, team, title_en, term: "2026-27" });
  const base = [P("1", "Paul", "Sponsorship Team", "Co-President"), P("2", "Eve", "Curriculum Team", "Senior Adviser"), P("3", "Ann", "Curriculum Team", "Director, Curriculum Team")];
  const out = withFounders(base, [{ id: "1", name_en: "Paul" }, { id: "9", name_en: "Old Founder" }, { id: "3", name_en: "Ann" }, { id: "9", name_en: "Twice" }, { id: "", name_en: "No Id" }, null]);
  assert.equal(out.length, 5, "已經離開的一張、在某個 team 的那位多一張，Co-President 還是一張");
  assert.equal(out[0].title, "Founder · Co-President · 2026-27"); assert.equal(leadRank(out[0].title), 0, "兼創辦人的 Co-President 跟創辦人排在一起");
  assert.deepEqual(out.filter(p => p.title === "Founder").map(p => p.name), ["Old Founder", "Ann"]);
  const { teams, rest } = splitGroups(out);
  assert.deepEqual(teams.map(g => g.key + ":" + g.people.map(p => p.name)), ["Curriculum:Ann"], "他在 team 裡的那一張不動");
  assert.equal(rest[0].key, LEAD_KEY); assert.deepEqual(rest[0].people.map(p => p.name), ["Paul", "Eve", "Old Founder", "Ann"]);
  assert.equal(leadHeading(rest[0].people, "en"), "Founders, Co-Presidents and Senior Advisers");
  assert.equal(leadHeading([out[0]], "en"), "Founders and Co-Presidents", "一個人兩個身分，標題兩種都寫");
  assert.deepEqual(withFounders(base, []), base); assert.deepEqual(withFounders(base, null), base);
  assert.equal(withFounders([], [{ id: "9" }]).length, 0, "沒有名字的不畫");
});
test("★ 團隊頁：創辦人那一支載不到（遷移檔還沒跑）不擋名單", () => {
  const main = readFileSync("team/src/main.js", "utf8");
  assert.match(main, /supabase\.rpc\("public_founders"\)\)\.then\(r => \(r && !r\.error && Array\.isArray\(r\.data\)\) \? r\.data : \[\], \(\) => \[\]\)/);
  assert.match(main, /withFounders\(\(data \|\| \[\]\)\.map\(toPerson\)/);
});

test("★ 設定頁：沒被標成創辦人的人完全看不到那一段；那個勾只叫本人的那一支", async () => {
  const { settingsHTML, founderHTML } = await import("../settings/src/ui.js");
  assert.equal(founderHTML(null), ""); assert.equal(founderHTML({ founder: false, consent: false }), "");
  const me = { id: "u1", role: "alumni", email: "a@b.c" };
  assert.doesNotMatch(settingsHTML(me, "", false, null, [], null), /id="fdr"/);
  assert.doesNotMatch(settingsHTML(me, "", false, null, [], null, { founder: false }), /id="fdr"/);
  const on = settingsHTML(me, "", false, null, [], null, { founder: true, consent: false });
  assert.match(on, /<input id="fdr" type="checkbox">/, "預設沒勾");
  assert.match(settingsHTML(me, "", false, null, [], null, { founder: true, consent: true }), /<input id="fdr" type="checkbox" checked>/);
  assert.doesNotMatch(settingsHTML({ ...me, role: "student" }, "", false, null, [], null, { founder: true, consent: false }), /id="fdr"/, "學員沒有這一段");
  // 那個勾在兩個自動儲存的容器外面：它不是 profiles 的欄位
  const before = on.slice(0, on.indexOf('id="fdr"')), opens = (before.match(/<div data-autosave=/g) || []).length;
  assert.equal(opens, 1, "前面只開過「我的資料」那一個容器"); assert.ok(before.lastIndexOf("</div>") > before.lastIndexOf("<div data-autosave="), "而且已經關起來了");
  const main = readFileSync("settings/src/main.js", "utf8");
  assert.match(main, /supabase\.rpc\("set_founder_consent", \{ p_ok: ok \}\)/);
  assert.match(main, /box\.checked = !ok;/, "沒存進去要把勾撥回原樣");
  assert.match(main, /Promise\.resolve\(supabase\.rpc\("my_founder"\)\)\.catch\(\(\) => \(\{ data: null \}\)\)/, "讀不到不擋整頁");
});

test("★ 後台：只有「標」與「取消」，沒有任何地方能替他同意；狀態載不到那一段就不出現", async () => {
  const { personEditHTML } = await import("../admin/people/src/ui.js");
  const TERMS = [{ id: "2026-27", status: "current" }];
  const p = { person_id: "p1", profile_id: "u1", role: "alumni", name_en: "Old Founder", positions: [], workspaces: [] };
  const page = (isPres, founder, who = p) => personEditHTML(who, TERMS, "me", isPres, "", false, null, [who], null, null, [], founder);
  assert.doesNotMatch(page(true, undefined), /founder-set/); assert.doesNotMatch(page(true, null), /founder-set/);
  assert.match(page(true, { founder: false, consent: false }), /data-act="founder-set" data-id="p1" data-on="1"/);
  assert.match(page(true, { founder: true, consent: false }), /data-act="founder-set" data-id="p1" data-on="0"/);
  assert.doesNotMatch(page(false, { founder: true, consent: true }), /founder-set/, "Senior Adviser 看得到狀態、沒有按鈕");
  assert.doesNotMatch(page(true, { founder: false, consent: false }, { ...p, profile_id: null, role: null }), /founder-set/, "沒有帳號的人不出現");
  for (const f of ["admin/people/src/data.js", "admin/people/src/main.js", "admin/people/src/ui.js", "admin/site/src/data.js", "admin/src/data.js"])
    assert.doesNotMatch(readFileSync(f, "utf8"), /set_founder_consent/, f + " 不准叫本人同意的那一支");
});
