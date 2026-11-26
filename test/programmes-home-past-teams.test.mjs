// 計畫搬到首頁與團隊頁、「團隊」底下多前幾屆（2026-11-25）。跑法：node --test test/programmes-home-past-teams.test.mjs
// Paul：「Our final decision is to move the programs into both the home page and Teams… at homepage, there's going to be programs from all the teams…
// we're adding alumni into Teams… a drop down that has current team, 2025 to 2026 alumni, 2024 to 2025 alumni」。
// 頂欄本身那一條在 test/whats-on.test.mjs；這裡守首頁那一段、/team/?term= 那一頁、與那一支遷移檔不准做的事。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homeProgrammes, TEAMS } from "../year/src/logic.js";
import { homeProgrammesHTML } from "../events/src/ui.js";
import { isTerm, termsOf, groupsOf, rosterHTML, yearsHTML, emptyHTML } from "../team/src/past.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const NOW = new Date("2026-11-25T12:00:00+08:00");
const EV = [
  { slug: "winter-bootcamp", team: "Curriculum Team", title_zh: "寒假探索營", title_en: "Winter Bootcamp", edition_en: "Overseas Unpacked", recurring: true, starts_at: "2027-01-03T00:00:00+08:00", signup_open: true },
  { slug: "intern-intake", team: "Internship Team", title_zh: "高中生實習招募", title_en: "High school intern intake", recurring: true, usual_month: 8 },
  { slug: "coffee-chat", team: "Mentorship Team", title_en: "Coffee chat", recurring: true },
  { slug: "one-off", team: "Marketing", title_en: "One-off talk", recurring: false, starts_at: "2026-12-01T00:00:00+08:00" },
  { slug: "who", team: "Something else", title_en: "No team", recurring: true },
];

test("★ 首頁「活動與計畫」：全部 team 的固定計畫，一個 team 一組，順序跟團隊頁同一份", () => {
  const g = homeProgrammes(EV, NOW, "en");
  assert.deepEqual(g.map(x => x.key), ["curriculum", "internship", "mentorship"], "沒有計畫的 team 不出現，不是固定在做的、認不出 team 的也不出現");
  assert.deepEqual(g.map(x => x.key), TEAMS.filter(k => g.some(x => x.key === k)), "順序照 TEAMS");
  assert.deepEqual(g[0], { key: "curriculum", label: "Curriculum", items: [{ slug: "winter-bootcamp", title: "Winter Bootcamp", state: "open", line: "Overseas Unpacked, 3 Jan" }] });
  assert.equal(g[1].items[0].line, "Around August"); assert.equal(g[1].items[0].state, "past", "八月已經過了");
  assert.equal(g[2].items[0].line, "", "這一屆叫什麼與時間都沒有就是空的");
  const zh = homeProgrammes(EV, NOW, "zh");
  assert.equal(zh[0].items[0].title, "寒假探索營"); assert.equal(zh[0].items[0].line, "Overseas Unpacked，1 月 3 日");
  assert.equal(zh[2].items[0].title, "Coffee chat", "沒有中文名退回英文名");
  assert.deepEqual(homeProgrammes([], NOW, "zh"), []); assert.deepEqual(homeProgrammes(null, NOW, "en"), []);
});

test("★ 首頁那幾列的畫法：team 連到團隊頁那個 team，每個計畫連到自己的活動頁，字跟團隊頁同一套", () => {
  const en = homeProgrammesHTML(homeProgrammes(EV, NOW, "en"), "en"), zh = homeProgrammesHTML(homeProgrammes(EV, NOW, "zh"), "zh");
  assert.equal((en.match(/<div class="wrow wteam">/g) || []).length, 3);
  assert.match(en, /<small>01<\/small><h3><a href="\.\/team\/#curriculum">Curriculum<\/a><\/h3>/);
  assert.match(en, /<a href="\.\/events\/\?lang=en#winter-bootcamp"><b>Winter Bootcamp<\/b><span>This year: Overseas Unpacked, 3 Jan<em>Open now<\/em><\/span><\/a>/);
  assert.match(en, /<b>High school intern intake<\/b><span>This year: Around August<em>Done<\/em><\/span>/);
  assert.match(en, /<b>Coffee chat<\/b><span>This year's date is not set yet<\/span>/);
  assert.match(zh, /<a href="\.\/events\/\?lang=zh#winter-bootcamp"><b>寒假探索營<\/b><span>這一屆：Overseas Unpacked，1 月 3 日<em>開放報名中<\/em><\/span>/);
  assert.match(zh, /<span>這一屆的時間還沒定<\/span>/);
  assert.doesNotMatch(en, /<a class="wrow/, "整列不是一條連結（裡面有好幾條），不准連結包連結");
  assert.equal(homeProgrammesHTML([], "zh"), ""); assert.equal(homeProgrammesHTML(null, "en"), "");
  assert.match(homeProgrammesHTML([{ key: "cr", label: "<b>x", items: [{ slug: 'a"b', title: "<i>", line: "", state: "" }] }], "en"), /&lt;b&gt;x[\s\S]*#a&quot;b[\s\S]*&lt;i&gt;/, "後台打的字都跳脫過");
});

test("★ 首頁的 HTML：問不到資料的時候原本那兩行還在，免費資源那一行兩種情況都在", () => {
  const h = read("index.html"), sec = h.slice(h.indexOf('<section class="what" id="what"'), h.indexOf('<section class="now" id="now"'));
  assert.match(sec, /<h2 id="what-h"><span class="zh">活動與計畫<\/span><span class="en">Programmes<\/span><\/h2>/);
  assert.match(sec, /<div class="zh" id="what-zh"><\/div>\s*<div class="en" id="what-en"><\/div>\s*<div id="what-static">/);
  const stat = sec.slice(sec.indexOf('<div id="what-static">'), sec.indexOf('<small id="what-res-n">'));
  assert.equal((stat.match(/<a class="wrow" href="\.\/year\/">/g) || []).length, 2, "探索營與導生配對那兩行是退路");
  assert.match(stat, /每年寒暑假各一場，兩天。/); assert.match(stat, /一學期配對一次。/);
  assert.match(sec, /<\/div>\s*<a class="wrow" href="\.\/resources\/">\s*<small id="what-res-n">03<\/small>/, "免費資源那一行在 #what-static 外面");
  assert.match(h, /if \(groups\.zh\.length\) \{[\s\S]*?document\.getElementById\("what-static"\)\.hidden = true;/, "有資料才把退路收起來");
  assert.match(h, /import \{ homeCardsHTML, homeProgrammesHTML, esc \} from "\.\/events\/src\/ui\.js"/);
});

test("★ /team/?term=：只有網址帶哪一屆才是那一頁，照片與六塊介紹收起來，三支原本的程式不跑", () => {
  const h = read("team/index.html");
  assert.match(h, /var pt = new URLSearchParams\(location\.search\)\.get\("term"\);\s*if \(\/\^\\d\{4\}-\\d\{2\}\$\/\.test\(pt \|\| ""\)\) document\.documentElement\.setAttribute\("data-past", pt\);/);
  assert.ok(h.indexOf('setAttribute("data-past", pt)') < h.indexOf("<style>"), "在畫面畫出來之前定好，不閃");
  assert.match(h, /#past\{display:none\}\s*html\[data-past\] #past\{display:block\}\s*html\[data-past\] main > \.zh,html\[data-past\] main > \.en\{display:none\}/);
  assert.match(h, /<main id="main">[\s\S]*?<section id="past">[\s\S]*?<div id="past-root">/);
  assert.match(h, /<script type="module" src="\.\/src\/past\.js\?v=[\w-]+"><\/script>/);
  assert.match(h, /"\/team\/src\/past\.js": "\/team\/src\/past\.js\?v=[\w-]+"/, "importmap 有這一支（版本號那一套）");
  const past = h.slice(h.indexOf('<section id="past">'), h.indexOf("</section>", h.indexOf('<section id="past">')));
  assert.doesNotMatch(past, /<li>|<img/, "名單不寫在 HTML 裡，是資料庫回的");
  for (const f of ["team/src/reel.js", "team/src/main.js", "team/src/programmes.js"]) assert.match(read(f), /hasAttribute\("data-past"\)\) return;/, f);
  assert.ok(isTerm("2025-26")); assert.ok(!isTerm("2025")); assert.ok(!isTerm("2025-26<")); assert.ok(!isTerm(null));
});

test("★ 前幾屆的名單：拿到什麼畫什麼，只有名字與職位，Leadership 在前、六個 team 照團隊頁的順序", () => {
  const rows = [
    { term: "2025-26", name_en: "Sample Associate", name_zh: "", team: "Curriculum Team", title_en: "Associate, Curriculum Team" },
    { term: "2025-26", name_en: "Sample Director", team: "curriculum", title_en: "Director, Curriculum Team" },
    { term: "2025-26", name_en: "Sample Lead", team: null, title_en: "Co-President" },
    { term: "2025-26", name_en: "", name_zh: "範例", team: "Community Relations Team", title_zh: "顧問" },
    { term: "2025-26", name_en: "", name_zh: "", team: "CR", title_en: "Associate" },
    { term: "2024-25", name_en: "Sample Earlier", team: "Marketing", title_en: "Associate" },
    { term: "junk", name_en: "x" },
  ];
  assert.deepEqual(termsOf(rows), ["2025-26", "2024-25"], "新的在前面，不像年份的不算");
  const g = groupsOf(rows, "2025-26");
  assert.deepEqual(g.map(x => x.key), ["__lead", "Curriculum", "CR"]);
  assert.deepEqual(g[1].people.map(p => p.name), ["Sample Director", "Sample Associate"], "Director 在前");
  assert.deepEqual(g[2].people.map(p => p.name), ["範例"], "沒有英文名才用中文名；兩個都沒有的不畫");
  const html = rosterHTML(g);
  assert.match(html, /<section class="pt-group"><h2><span class="zh">Leadership<\/span><span class="en">Leadership<\/span><\/h2><ul class="pt-list"><li><b>Sample Lead<\/b><span>Co-President<\/span><\/li><\/ul><\/section>/);
  assert.match(html, /<h2><span class="zh">Community Relations<\/span>/);
  assert.doesNotMatch(html, /<img|avatar|2025-26/, "沒有照片，職位後面不接屆別（整頁已經是那一屆）");
  assert.deepEqual(groupsOf(rows, "2023-24"), []); assert.deepEqual(groupsOf(null, "2025-26"), []);
  assert.match(emptyHTML(), /這一屆的名單還沒有放上來。[\s\S]*This year's list is not up yet\./);
  assert.equal(yearsHTML(["2025-26", "2024-25"], "2025-26"), '<a href="./?term=2025-26" aria-current="page">2025-26</a><a href="./?term=2024-25">2024-25</a>');
  assert.equal(yearsHTML(["2025-26"], "2025-26"), "", "只有這一屆就不用畫切換");
  assert.equal(yearsHTML([], "2025-26"), "");
  assert.match(yearsHTML(["2024-25"], "2025-26"), /href="\.\/\?term=2024-25"/, "這一屆還沒開、別屆開了：給一條路過去");
  assert.match(rosterHTML([{ key: "X", people: [{ name: "<b>", title: '"' }] }]), /<b>&lt;b&gt;<\/b><span>&quot;<\/span>/, "名字與職位都跳脫過");
});

test("★ past.js 不自己過濾：誰出現由資料庫決定，問不到跟沒打開是同一句話", () => {
  const js = read("team/src/past.js");
  assert.match(js, /supabase\.rpc\("public_past_team"\)/);
  assert.doesNotMatch(js, /supabase\s*\.from\(/, "不直接讀任何一張表");
  assert.equal((js.match(/supabase\.rpc\(/g) || []).length, 1, "只問那一支");
  assert.match(js, /root\.innerHTML = groups\.length \? rosterHTML\(groups\) : emptyHTML\(\);/);
  assert.doesNotMatch(js.replace(/^\s*\/\/[^\n]*/gm, ""), /alert\(|遷移檔|not been run|Co-President/i, "不對讀者講內部的事（註解不算）");
});

// ── 遷移檔不准做的事 ──
const FILE = "supabase/migrations/2027-01-11-past-teams.sql";
const sql = read(FILE), code = sql.replace(/--[^\n]*/g, "");
const fnBody = name => { const a = code.indexOf("create or replace function public." + name + "("); assert.ok(a >= 0, name); return code.slice(a, code.indexOf("$$;", a)); };

test("★ 遷移檔：跑完對外一個名字都不會多（開關預設關），開關與藏人只有 Co-President", () => {
  assert.match(code, /add column if not exists past_public\s+boolean not null default false;/);
  assert.doesNotMatch(code, /set\s+past_public\s*=\s*true/i, "這一支不替任何一屆打開");
  assert.doesNotMatch(code, /insert into public\.past_team_hidden|insert into public\.terms|update public\.(people|positions|profiles)|delete from public\./i, "不動任何既有的資料");
  for (const f of ["set_past_team_public", "set_past_team_hidden"]) { const b = fnBody(f); assert.match(b, /if not public\.is_president\(\) then\s*raise exception 'not_president'/, f); }
  assert.match(fnBody("set_past_team_public"), /if v_status <> 'ended' then[\s\S]*?raise exception 'term_not_ended'/, "這一屆開不了，這一屆的人走 public_team()");
  assert.match(fnBody("past_team_admin"), /perform public\.require_senior\(\);/);
  assert.match(code, /alter table public\.past_team_hidden enable row level security;\s*revoke all on public\.past_team_hidden from public, anon, authenticated;/);
  assert.equal((code.match(/create policy/gi) || []).length, 0, "沒有新的政策");
});

test("★ 遷移檔：對外那一支只回名字、team、職位；學員、本人要求移除的、被藏的都不回", () => {
  const b = fnBody("public_past_team");
  assert.match(code, /function public\.public_past_team\(\)\s*returns table \(term text, name_en text, name_zh text, team text, title_en text, title_zh text\)/);
  assert.match(b, /join terms t on t\.id = po\.term_id and t\.status = 'ended' and t\.past_public/);
  assert.match(b, /pe\.kind = 'member'/); assert.match(b, /pe\.forgotten_at is null/);
  assert.match(b, /not exists \(select 1 from past_team_hidden h where h\.person_id = pe\.id\)/);
  assert.doesNotMatch(b, /email|avatar|profile_id|school|grad_year|pe\.id,|note/, "沒有 email、照片、學校、id、備註");
  const anon = [...code.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to ([^;]+);/g)].filter(m => /anon/.test(m[2])).map(m => m[1]);
  assert.deepEqual(anon, ["public_past_team"], "沒登入叫得到的只有對外那一支");
  for (const f of ["past_team_admin", "set_past_team_public", "set_past_team_hidden"]) assert.match(code, new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon;`), f);
  assert.doesNotMatch(code, /create or replace function public\.public_team\b/, "這一屆那一支沒有動");
});

test("house style：begin 與 commit 各一個、驗收表有 OVERALL、檔頭有 Paul 的原話與怎麼收回來", () => {
  const st = code.split(";").map(s => s.trim());
  assert.equal(st.filter(s => /^begin$/i.test(s)).length, 1); assert.equal(st.filter(s => /^commit$/i.test(s)).length, 1);
  assert.match(code, /'OVERALL' as 項目/);
  assert.match(sql, /we're adding alumni into Teams/); assert.match(sql, /Whole roster, names only/);
  assert.match(sql, /update public\.terms set past_public = false;/);
  assert.match(sql, /未滿 18 歲的人一律要藏/);
});

test("smoke.sh 有跑這一支（它的清單是寫死的，新增遷移檔要自己加）", () => {
  const smoke = read("scripts/db/smoke.sh");
  assert.match(smoke, /PTM_FILE=supabase\/migrations\/2027-01-11-past-teams\.sql/);
  assert.match(smoke, /跑完對外一個名字都沒有/);
});

test("★ 後台「前幾屆的名單」：只叫那三支函式，開關與勾選只給 Co-President，遷移檔沒跑印一句要跑哪一支", () => {
  const js = read("admin/site/src/past.js"), main = read("admin/site/src/main.js"), str = read("admin/site/src/strings.js");
  assert.deepEqual([...js.matchAll(/supabase\.rpc\("(\w+)"/g)].map(m => m[1]), ["past_team_admin", "set_past_team_public", "set_past_team_hidden"]);
  assert.doesNotMatch(js, /supabase\s*\.from\(/, "不直接讀寫任何一張表");
  assert.match(js, /export const PAST_FILE = "2027-01-11-past-teams\.sql";/);
  assert.match(js, /if \(past === null\) return head \+ `<div class="msg err">\$\{T\("past\.notInstalled", \{ file: PAST_FILE \}\)\}/);
  assert.match(js, /const off = busy \|\| !isPresident \? " disabled" : "";/, "不是 Co-President 就是灰的（真正的門在資料庫）");
  assert.match(js, /T\("past\.warn"\)/, "開關上面有未成年那一句提醒");
  assert.match(main, /PAST\.pastTeamsHTML\(S\.past, !!S\.me\.pres, S\.busy\)/);
  assert.match(main, /S\.past === undefined \? "" :/, "讀不到就不畫那一塊，上面那一份名單照常");
  assert.match(main, /if \(act === "past-public" \|\| act === "past-hide"\) \{[\s\S]*?await loadPast\(\);\s*return;/, "做完（或沒做成）都把名單重讀一次");
  for (const k of [...js.matchAll(/T\("((?:past|msg|common)\.[\w.]+)"/g)].map(m => m[1]).concat(["msg.pastOpened", "msg.pastClosed", "past.whyHidden", "past.whyNotMember", "past.whyForgotten", "past.whyNoName"]))
    assert.match(str, new RegExp(`"${k.replace(/\./g, "\\.")}":\\s+\\{ zh: "[^"]`), k + " 中英都有");
  assert.match(str, /"past\.warn":[^\n]*未滿 18 歲[^\n]*under 18/);
  assert.match(read("admin/admin.css"), /\.past-term\{/);
});
