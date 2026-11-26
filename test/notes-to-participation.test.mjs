// 備註變成參與紀錄那一支遷移檔的規則（2027-01-08）。跑法：node --test test/notes-to-participation.test.mjs
// Paul 2026-11-25：「I want every note like this to be gone, but actually into our BT participation record」
// 「whoever has that participation, don't delete their participation, but compare their notes and their participation before you do anything」
// 這一支只讀檔，守的是「這個檔不准做的事」：真的跑起來對不對由 scripts/db/smoke.sh 最後一段守（它在一個用完就丟的資料庫上跑）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const FILE = "supabase/migrations/2027-01-08-notes-to-participation.sql";
const sql = read(FILE);
const code = sql.replace(/--[^\n]*/g, "");
const statements = code.split(";").map(s => s.trim()).filter(Boolean);
const touching = (re) => statements.filter(s => re.test(s));

test("已經有的參與紀錄：整個檔只有一句 insert，沒有任何一句 update 或 delete", () => {
  assert.equal(touching(/^insert into public\.rc_participation\b/i).length, 1, "只有一句 insert into rc_participation");
  assert.equal(touching(/^update\s+(public\.)?rc_participation\b/i).length, 0, "不准 update rc_participation");
  assert.equal(touching(/^delete\s+from\s+(public\.)?rc_participation\b/i).length, 0, "不准 delete from rc_participation");
  assert.equal(touching(/^(truncate|drop table)\s+(if exists\s+)?(public\.)?rc_/i).length, 0, "不准清或丟任何一張 rc_ 的表");
  assert.equal(touching(/^delete\s+from\s+public\./i).length, 0, "整個檔對 public 的表沒有任何一句 delete");
});

test("加的每一列都認得出來：import、attended、備註開頭是那兩句之一", () => {
  const ins = touching(/^insert into public\.rc_participation\b/i)[0];
  assert.match(ins, /'attended', 'import',/);
  assert.match(ins, /'Inferred from old database note: '/);
  assert.match(ins, /'From old database note: '/);
  // 這一句裡有「'; cohort '」，照分號切會被切斷，所以後半段對整個檔比
  assert.match(code, /from n2p_c c where c\.res = 'add'\s+on conflict do nothing;/, "只加判成 add 的那幾件，撞到已經有的那一列就什麼都不做");
  // 檔頭寫的還原方法用的是同一個開頭
  assert.match(sql, /delete from public\.rc_participation where source = 'import' and note ~ '\^\(From\|Inferred from\) old database note: '/);
});

test("那一場他已經有紀錄就不補：同一個身分算已經有，另一個身分留在備註", () => {
  assert.match(code, /x\.event_id = c\.event_id and x\.role = c\.role\) then 'covered'/);
  assert.match(code, /x\.person_id = c\.person_id and x\.event_id = c\.event_id\) then 'conflict'/);
  assert.match(code, /c\.res in \('conflict', 'noevent'\)/, "衝突與找不到那一場的那一段留在備註");
  assert.match(code, /having count\(\*\) = 1/, "用名字加日期找活動，剛好一場才算找到");
});

test("沒有新的函式、政策、權限，也沒有新的表；多的只有備份表兩欄", () => {
  assert.equal(touching(/^create (or replace )?function/i).length, 0);
  assert.equal(touching(/^(create|alter|drop) policy/i).length, 0);
  assert.equal(touching(/^grant\b/i).length, 0);
  assert.equal(touching(/row level security/i).length, 0);
  const tables = touching(/^create table/i);
  assert.equal(tables.length, 0, "create table 只准是 temp 的：" + tables.map(s => s.slice(0, 40)).join(" / "));
  const alters = touching(/^alter table/i);
  assert.equal(alters.length, 2);
  for (const a of alters) assert.match(a, /^alter table public\.rc_note_backup add column if not exists (note_before_convert text|convert_at timestamptz)$/);
});

test("原文存進備份表，第一次存的那一份不會被後來的蓋掉；rc_log 裡沒有備註的字", () => {
  const bk = touching(/^insert into public\.rc_note_backup\b/i);
  assert.equal(bk.length, 1);
  assert.match(bk[0], /note_before_convert = coalesce\(public\.rc_note_backup\.note_before_convert, excluded\.note_before_convert\)/);
  assert.doesNotMatch(bk[0], /\bnote = excluded\.note\b/, "2026-12-12 存的那一欄不准動");
  const log = touching(/^insert into public\.rc_log\b/i);
  assert.equal(log.length, 1);
  assert.doesNotMatch(log[0], /old_note|n\.new_note(?! is not null)|k\.token|detail/, "rc_log 在忘記一個人的時候不會清，不准放備註或標籤的字");
  // 備份要寫在改備註之前
  assert.ok(code.indexOf("insert into public.rc_note_backup") < code.indexOf("update public.people p set note"), "先備份再改");
  assert.equal(touching(/^update public\.people\b/i).length, 1, "people 只有一句 update，而且只改 note");
  assert.match(touching(/^update public\.people\b/i)[0], /^update public\.people p set note = n\.new_note from n2p_new n where n\.id = p\.id and n\.changed$/);
});

test("新開的活動：只有那三場，archived、import、不寫日期", () => {
  const ev = touching(/^insert into public\.events\b/i);
  assert.equal(ev.length, 1);
  assert.match(ev[0], /^insert into public\.events \(slug, team, workspace_id, title_zh, title_en, status, kind, term_id, source\)/, "欄位裡沒有 starts_at");
  assert.match(ev[0], /'archived', 'other', .*'import'/s);
  assert.match(ev[0], /on conflict \(slug\) do nothing$/i);
  for (const slug of ["spring-2021-event-1", "spring-2021-event-2", "spring-2025-event"]) assert.ok(ev[0].includes(`'${slug}'`), slug);
  assert.match(ev[0], /where exists \(select 1 from n2p_c c where c\.term = ph\.term and c\.role = ph\.role\)/, "有人要掛才開");
  assert.equal(touching(/^update public\.events\b/i).length, 0, "不改任何一場已經有的活動");
});

test("標籤：新的以 Old database: 開頭，本來有字的接在後面", () => {
  const lab = touching(/^insert into public\.rc_labels\b/i);
  assert.equal(lab.length, 1);
  const upd = code.slice(code.indexOf("insert into public.rc_labels")).split("update n2p_tok k set keep")[0];
  assert.match(upd, /when btrim\(public\.rc_labels\.detail\) = '' then excluded\.detail/);
  assert.match(upd, /when position\(excluded\.detail in public\.rc_labels\.detail\) > 0 then public\.rc_labels\.detail/);
  assert.match(upd, /else left\(public\.rc_labels\.detail \|\| '; ' \|\| excluded\.detail, 160\) end;/);
  assert.doesNotMatch(upd, /since_year\s*=|until_year\s*=|set_by\s*=/, "本來就有的那一列，年份與誰設的不動");
  assert.match(code, /left\('Old database: ' \|\| string_agg\(distinct detail, '; '\), 160\)/);
  assert.equal(touching(/^(update|delete from) public\.rc_labels\b/i).length, 0);
});

test("留在備註裡的：HS dept、mentor(s) 的名字、研究生與工作的 status 都不在會被拿掉的寫法裡", () => {
  const shapes = code.slice(code.indexOf("update n2p_tok set shape = case"), code.indexOf("else 'other' end"));
  assert.doesNotMatch(shapes, /hs dept/i);
  assert.doesNotMatch(shapes, /mentor\\\(s\\\)|graduate|working/i);
  assert.match(shapes, /\^status\\s\*:\\s\*\(student\|alumni\)\$/, "status 只拿掉 Student 與 Alumni");
  assert.match(code, /when k\.shape = 'other' then true/, "看不懂的字一律留著");
});

test("house style：begin 與 commit 各一個、驗收表有 OVERALL、不印名字、檔頭寫了還原方法與 Paul 的原話", () => {
  assert.equal(statements.filter(s => /^begin$/i.test(s)).length, 1);
  assert.equal(statements.filter(s => /^commit$/i.test(s)).length, 1);
  assert.match(code, /'OVERALL' as 項目/);
  assert.doesNotMatch(code, /name_zh|name_en|\.email\b|rc_person_name|auth\.users/, "整個檔不讀也不印任何人的名字或 email");
  assert.match(sql, /I want every note like this to be gone, but actually into our BT participation record/);
  assert.match(sql, /whoever has that participation, don't delete their participation/);
  assert.match(sql, /要整個還原/);
  assert.match(sql, /note_before_convert is not null;/);
});

test("smoke.sh 有跑這一支（它的清單是寫死的，新增遷移檔要自己加）", () => {
  const smoke = read("scripts/db/smoke.sh");
  assert.match(smoke, /NPM_FILE=supabase\/migrations\/2027-01-08-notes-to-participation\.sql/);
  assert.match(smoke, /破壞測試：拿掉「已經是另一個身分就不補」/);
  assert.match(smoke, /重跑一次也全 PASS，這一次加 0 列/);
});
