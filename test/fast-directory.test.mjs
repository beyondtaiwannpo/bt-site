// 後台速度（2026-11-25）：名錄與活動那兩頁。跑法：node --test test/*.test.mjs
// Paul：「when I am trying to load the directory of people and events, it runs really slowly. Every push or every reload take about 10 seconds…
//   I want it to be under a second to load out stuff.」
// 正式站量到的：rc_directory() 1250 個人一趟 7.6 秒（每個人重算一次標籤），而且存一次就重拿一次；
//   活動那一頁每次開頁都等一趟一秒多的 public_team（待辦那一包裡的），它其實只有「各 team」那一頁與側欄的小數字在用。
// 這一支守三件事（都是「改回去就會變慢、而且畫面上看不出哪裡錯」的那一種）：
//   1. 遷移檔：名錄的標籤一次算完，門與不公開的去向沒有變，smoke.sh 有跑它。
//   2. 紀錄那一頁：要等的一起等；存一個人的東西不把名錄丟掉重拿。
//   3. 後台活動那一頁：不等待辦那一包；開頁問過的活動與專案不問第二次。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const noComments = s => s.replace(/--[^\n]*/g, "");

test("★ 遷移檔：名錄不再一個人叫一次標籤、名字、能不能管；門與不公開的去向照舊", () => {
  const sql = noComments(read("supabase/migrations/2027-01-12-fast-directory.sql"));
  const dir = sql.slice(sql.indexOf("function public.rc_directory()"), sql.indexOf("commit;"));
  assert.doesNotMatch(dir, /rc_label_codes\(|rc_person_name\(/, "一個人叫一次的那兩支不能回到名錄裡（1250 個人就是 1250 次）");
  assert.equal((dir.match(/rc_can_manage\(\)/g) || []).length, 1, "能不能管整趟只問一次");
  assert.equal((dir.match(/rc_can_view\(\)/g) || []).length, 1, "看不看得到整趟只問一次");
  assert.match(dir, /from public\.rc_label_codes_all\(\) c where \(select can_view from me\)/, "讀不到名錄的人連標籤都不算");
  assert.match(dir, /where pe\.forgotten_at is null and me\.can_view/);
  assert.match(dir, /select case when \(select can_view from me\) then coalesce\(\(/);
  assert.match(dir, /else '\[\]'::jsonb end;/);
  assert.equal((dir.match(/o\.visibility <> 'private' or pe\.can_manage/g) || []).length, 2, "countries 與 latest 兩格都看不公開的那道門");
  assert.doesNotMatch(dir, /email/);
  // 回的鍵與順序（畫面照這些鍵讀；順序是「換之前換之後一模一樣」那條 smoke 在守的）
  const keys = [...dir.slice(dir.indexOf("jsonb_build_object(")).matchAll(/'([a-z_]+)', (?!')/g)].map(m => m[1]);
  assert.deepEqual(keys, ["id", "name", "name_zh", "name_en", "kind", "labels", "field", "job_title", "job_org", "city", "country_now", "photo_url", "offer_speak", "offer_mentor",
    "profile_done", "rel_open", "role", "team", "school", "grad_year", "schools", "aliases", "has_account", "terms", "events", "roles", "countries", "latest", "n"]);
  // 誰叫得到
  assert.match(sql, /revoke all on function public\.rc_label_codes_all\(\) from public, anon, authenticated;/, "一次算全部的那一支不開給前端");
  assert.match(sql, /revoke all on function public\.rc_directory\(\) from public, anon;\s*grant execute on function public\.rc_directory\(\) to authenticated;/);
  // 驗收表逐人對規則的正本
  assert.match(sql, /coalesce\(a\.codes, '\[\]'::jsonb\) is distinct from public\.rc_label_codes\(p\.id\)/, "驗收表要逐人對 rc_label_codes（規則的正本）");
});

test("遷移檔：一次算全部的標籤有十一種、順序跟 rc_labels_of 一樣", () => {
  const sql = noComments(read("supabase/migrations/2027-01-12-fast-directory.sql"));
  const of = noComments(read("supabase/migrations/2027-01-06-labels-and-schools.sql"));
  const ords = s => { const m = s.match(/ords\(label, ord\) as \(values ([\s\S]*?)\),\s*\n\s*l as/); return m ? m[1].replace(/\s+/g, " ") : null; };
  assert.ok(ords(of), "在 2027-01-06 那一支找得到 ords");
  assert.equal(ords(sql), ords(of), "標籤的清單與順序要跟 rc_labels_of 一樣");
  const all = sql.slice(sql.indexOf("function public.rc_label_codes_all()"), sql.indexOf("function public.rc_directory()"));
  for (const l of ["member", "intern", "student", "mentee", "mentor", "speaker", "volunteer", "organizer", "professor", "admission_officer", "connection"])
    assert.match(all, new RegExp("\\('" + l + "',"), l);
  assert.match(all, /where p\.forgotten_at is null/, "只算還在的人");
});

test("smoke.sh 有跑這一支，而且比的是換之前與換之後的整份名錄", () => {
  const sm = read("scripts/db/smoke.sh");
  assert.match(sm, /FASTM=supabase\/migrations\/2027-01-12-fast-directory\.sql/);
  assert.match(sm, /insert into public\.fd_old select 'paul', e, e::text from jsonb_array_elements\(public\.rc_directory\(\)\) e/, "換之前先記下來");
  assert.match(sm, /where o\.txt is distinct from n\.txt/, "逐人、連鍵的順序一起比");
  assert.ok(sm.indexOf("insert into public.fd_old") < sm.indexOf('-f "${FASTM}"'), "記下來要在換之前");
});

test("★ 紀錄那一頁：要等的一起等，存一個人的東西不重拿名錄", () => {
  const m = read("admin/records/src/main.js");
  // 開頁：bootstrap 與名錄跟「我是誰」一起問
  const boot = m.slice(m.indexOf("async function boot("), m.indexOf("const VIEWS"));
  assert.ok(boot.indexOf("D.loadBootstrap()") < boot.indexOf("await D.loadMe("), "bootstrap 要在等「我是誰」之前就發出去");
  assert.match(boot, /dirP = S\.view === "people" && !S\.id \? D\.loadDirectory\(\) : null/);
  assert.match(boot, /await Promise\.all\(\[loadBoot\(bootP\), dirP \? loadDir\(dirP\) : null\]\);/);
  assert.ok(boot.indexOf("parseHash();") < boot.indexOf("D.loadBootstrap()"), "要先知道開的是哪一頁");
  assert.match(boot, /if \(!S\.me \|\| S\.me\.role !== "cadre"\) \{ render\(\); return; \}/, "不是幹部照舊擋在這裡");
  // 一個人的頁面：兩趟一起
  assert.match(m, /const \[person\] = await Promise\.all\(\[D\.loadPerson\(S\.id\), needDir \? \(dirFlight \|\| loadDir\(\)\) : null\]\);/);
  // 存：不再有「先等這個人、再等 bootstrap」的排隊
  assert.doesNotMatch(m, /await loadPerson\(\); await loadBoot\(\)/, "兩趟要一起等");
  assert.doesNotMatch(m, /await loadBoot\(\); (if \(act === "dup-merge"\) )?await loadDir\(\)/, "兩趟要一起等");
  // 存一個人的東西：名錄先留著（dirStale），回名錄才重拿。把人併掉、移除、新增才整份丟掉。
  const nulls = [...m.matchAll(/([^\n]*)S\.dir = null;([^\n]*)/g)].map(x => x[0]);
  for (const line of nulls)
    assert.match(line, /dup-merge|msg\.merged|msg\.forgot|go\("people\/" \+ id\)|loadBoot\(\)|manual|S\.dirErr/, "只有名單的人數會變的時候才丟掉名錄：" + line.trim().slice(0, 90));
  assert.ok((m.match(/S\.dirStale = true/g) || []).length >= 6, "存一個人的東西只標「舊了」");
  assert.match(m, /else if \(S\.view === "people" && \(!Array\.isArray\(S\.dir\) \|\| S\.dirStale\)\) \{ await \(!S\.dirStale && dirFlight \? dirFlight : loadDir\(\)\); S\.dirStale = false; \}/, "回名錄的時候重拿；舊了的一定是新問的，不拿背景那一趟");
  // 第二輪（2026-11-26）：開的不是名錄也先在背景拿回來；存一個人的東西不等 bootstrap
  assert.match(boot, /await openRoute\(\);[\s\S]*if \(S\.boot && S\.boot\.can_view && !Array\.isArray\(S\.dir\) && !dirFlight\) \{ const f = loadDir\(\)\.finally/, "畫完才在背景拿名錄，讀不到的人不問");
  assert.equal((m.match(/S\.dirStale = true; await loadPerson\(\); refreshBootQuietly\(\); S\.msg = T\("msg\.saved"\); render\(\); return;/g) || []).length, 2, "存完只等這個人回來，bootstrap 在背景重拿");
  assert.match(m, /function refreshBootQuietly\(\) \{\s*loadBoot\(\)\.then\(\(\) => \{ const a = document\.activeElement; if \(!S\.busy && !\(a && \/\^\(INPUT\|TEXTAREA\|SELECT\)\$\/\.test\(a\.tagName\)\)\) render\(\); \}\);/, "人正在打字就不重畫");
});

test("★ 後台活動那一頁：不等待辦那一包，開頁問過的不問第二次", () => {
  const m = read("admin/src/main.js");
  const boot = m.slice(m.indexOf("async function boot("), m.indexOf("// 側欄的兩個分頁"));
  const all = boot.slice(boot.indexOf("await Promise.all(["), boot.indexOf("]);", boot.indexOf("await Promise.all([")));
  assert.doesNotMatch(all, /loadTodo/, "待辦那一包不在大家一起等的那一輪裡（裡面的 public_team 正式站一趟一秒多）");
  assert.match(boot, /const todoP = defer \? null : D\.loadTodo\(S\.me\)\.catch\(\(\) => \(\{\}\)\);/);
  assert.match(boot, /else if \(\/\^\(teams\|home\)\$\/\.test\(hash0\)\) takeTodo\(await todoP\);/, "只有「各 team」那一頁等它");
  assert.match(boot, /else \{ takeTodo\(\{\}\); todoP\.then\(todo => \{ takeTodo\(todo\); quietRender\(\); \}\); \}/, "其他頁先畫，回來再補");
  // 第二輪（2026-11-26）：開頁就是活動那一頁，先問它自己要的，畫完才問其他的
  assert.match(boot, /const defer = !light && \(\(hash0 === "" && new URLSearchParams\(location\.search\)\.get\("tab"\) !== "forms"\) \|\| \/\^events\(\\\/\|\$\)\/\.test\(hash0\)\);/);
  assert.match(all, /light \|\| defer \? null : D\.loadRequests\(\)/); assert.match(all, /light \|\| defer \? null : D\.loadMeetings\(\)/);
  assert.match(all, /light \? null : D\.loadEvents\(\)/, "活動自己在第一輪");
  assert.match(boot, /const pendingP = light \|\| defer \? Promise\.resolve\(\[\]\) : D\.loadPendingAll\(\)/);
  assert.equal((boot.match(/if \(defer\) secondWave\(\); return; \}/g) || []).length, 2, "兩條開活動的路畫完都跑第二輪");
  assert.ok(boot.indexOf("await openTab(") < boot.lastIndexOf("if (defer) secondWave();"), "第二輪在畫完之後");
  assert.match(boot, /if \(S\.requests == null\) S\.requests = rq; if \(S\.meetings == null\) S\.meetings = mt;/, "人已經點進那一頁自己重拿過的不蓋掉");
  assert.match(boot, /if \(!defer\) sideJobs\(\);/, "提醒信與 Google 日曆：活動那一頁放到第二輪，別的頁照舊");
  assert.match(boot, /INPUT\|TEXTAREA\|SELECT/, "人正在打字就不重畫");
  assert.match(boot, /S\.todo\.requests = S\.requests; S\.todo\.events = S\.events; S\.todo\.meetings = S\.meetings;/, "待辦要的三樣照舊掛上去");
  // 專案清單跟第一輪一起問；三秒內不問第二次
  assert.match(boot, /if \(hash0 === "" \|\| \/\^events\(\\\/\|\$\)\/\.test\(hash0\)\) \{ const p = D\.loadProjects\(\);/);
  assert.match(m, /const pre = bootProjects && Date\.now\(\) - bootProjects\.at < 3000 \? bootProjects\.p : null; bootProjects = null;/);
  assert.match(m, /if \(!\(S\.events && Date\.now\(\) - bootEventsAt < 3000\)\) S\.events = await D\.loadEvents\(\);\s*bootEventsAt = 0;/, "之後每一次都照舊重問");
});
