// 幹部護照的後台（/admin/passports/ 的「幹部護照」分頁，2026-10-20，批 2）：
// Co-President 改格子、月份時刻、城市。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tabsHTML, passportAdminHTML, citiesHTML, activityEditHTML, monthEditHTML, destinationEditHTML,
         ACT_CATS } from "../admin/passports/src/ui.js";
import { says } from "../admin/passports/src/data.js";
import { CATEGORY } from "../passport/src/ui.js";

const DATA = {
  months: [{ seq: 1, month: 9, theme_zh: "07:00", theme_en: "" }, { seq: 2, month: 10, theme_zh: "", theme_en: "" }],
  activities: [
    { id: "09A", month: 9, seq: 1, category: "gather", title_zh: "開學電影夜", title_en: "OPENING NIGHT", description: "選片", needs_host: true, callback_to: null, active: true },
    { id: "09B", month: 9, seq: 1, category: "prompt", title_zh: "我是怎麼進來的", title_en: "HOW I GOT HERE", description: null, needs_host: false, callback_to: null, active: false },
    { id: "10C", month: 10, seq: 2, category: "frame", title_zh: "十月的天空", title_en: "OCTOBER SKY", description: "", needs_host: false, callback_to: "09B", active: true },
  ],
  destinations: [{ code: "TPE", city: "TAIPEI", active: true }, { code: "LAX", city: "LOS ANGELES", active: false }],
  stamped: { "09A": 12 },
};

test("★ 幹部護照那個分頁只有 Co-President 看得到", () => {
  assert.match(tabsHTML("cadre", true), /data-t="cadre"/);
  assert.doesNotMatch(tabsHTML("interns", false), /data-t="cadre"/);
  assert.match(tabsHTML("interns", false), /data-t="interns"/);
});

test("三個分類跟護照本身的 CATEGORY 同一組鍵（後台的下拉選單不能多也不能少）", () => {
  assert.deepEqual(ACT_CATS.map(c => c.v).sort(), Object.keys(CATEGORY).sort());
  const sql = readFileSync("supabase/migrations/2026-10-20-passport-admin.sql", "utf8");
  for (const c of ACT_CATS) assert.ok(sql.includes(`'${c.v}'`), `遷移檔的 check 裡沒有 ${c.v}`);
});

test("主畫面：每個月一段、格子有編號與分類、蓋過的人數、停用中的標籤", () => {
  const h = passportAdminHTML(DATA, "", false);
  assert.match(h, /9 月/);
  assert.match(h, /10 月/);
  assert.match(h, /07:00/);
  assert.match(h, /開學電影夜/);
  assert.match(h, /12 人蓋過/);
  assert.match(h, /還沒有人蓋/);
  assert.match(h, /停用中/);
  assert.match(h, /要主持人/);
  assert.match(h, /回望 09B/);
  assert.match(h, /聚會/);
  assert.match(citiesHTML(DATA, "", false), /TAIPEI/);
});

test("★ 蓋過的格子沒有「刪掉」，沒人蓋過的才有", () => {
  const h = passportAdminHTML(DATA, "", false);
  assert.doesNotMatch(h, /data-act="act-del" data-id="09A"/);
  assert.match(h, /data-act="act-del" data-id="09B"/);
  assert.match(h, /data-act="act-off" data-id="09A"/, "蓋過的還是可以停用");
  assert.match(h, /data-act="act-on" data-id="09B"/, "停用中的可以恢復");
});

// 城市 2026-10-19 起自己一頁（citiesHTML），不在幹部護照那一頁。
test("★ 城市只有停用與恢復，沒有刪掉", () => {
  assert.doesNotMatch(passportAdminHTML(DATA, "", false), /dest-off|TAIPEI/, "城市不再跟 33 格擠在同一頁");
  const h = citiesHTML(DATA, "", false);
  assert.match(h, /<table class="table"/);
  assert.doesNotMatch(h, /dest-del/);
  assert.match(h, /data-act="dest-off" data-code="TPE"/);
  assert.match(h, /data-act="dest-on" data-code="LAX"/);
  assert.match(h, /data-act="dest-new"/);
});

test("★ 編號不是輸入框：新增時說由系統算，改既有的時只顯示不給改；月份建了就鎖住", () => {
  const add = activityEditHTML(null, 9, DATA.months, "", false, null);
  assert.doesNotMatch(add, /id="ak-id"/);
  assert.match(add, /由系統照月份算/);
  assert.match(add, /<select id="ak-month">/, "新增時月份選得了");
  const edit = activityEditHTML(DATA.activities[0], 9, DATA.months, "", false, null);
  assert.doesNotMatch(edit, /id="ak-id"/);
  assert.match(edit, /編號 <b>09A<\/b>（不能改/);
  assert.match(edit, /<select id="ak-month" disabled>/, "改既有的時月份鎖住");
  assert.match(edit, /data-act="act-save" data-id="09A"/);
  assert.match(edit, /id="ak-host" type="checkbox"[^>]*checked/);
});

test("存檔被擋之後剛填的東西要留在畫面上（draft 優先於原值）", () => {
  const draft = { id: "09A", month: 9, category: "frame", title_zh: "改到一半", title_en: "HALF", description: "x", needs_host: false, callback_to: "" };
  const h = activityEditHTML(DATA.activities[0], 9, DATA.months, "存不起來：x", false, draft);
  assert.match(h, /value="改到一半"/);
  assert.match(h, /存不起來：x/);
  const m = monthEditHTML(DATA.months[0], "", false, { ...DATA.months[0], theme_zh: "07:30" });
  assert.match(m, /value="07:30"/);
  const d = destinationEditHTML(null, "", false, { code: "NRT", city: "TOKYO", active: true });
  assert.match(d, /value="NRT"/);
});

test("月份那一頁不給改 seq 與月份，只有時刻", () => {
  const h = monthEditHTML(DATA.months[0], "", false, null);
  assert.doesNotMatch(h, /id="mk-seq"|id="mk-month"/);
  assert.match(h, /data-act="month-save" data-seq="1"/);
  assert.match(h, /9 月的時刻/);
});

test("城市代碼建了就不能改", () => {
  const h = destinationEditHTML(DATA.destinations[0], "", false, null);
  assert.match(h, /id="dk-code" value="TPE"[^>]*disabled/);
  assert.match(h, /data-act="dest-save" data-code="TPE"/);
  assert.doesNotMatch(destinationEditHTML(null, "", false, null), /id="dk-code" value=""[^>]*disabled/);
});

test("★ 每一種錯誤碼都翻成人話，而且指到對的遷移檔", () => {
  for (const code of ["bad_month", "month_full", "no_such_activity", "month_locked", "bad_callback",
                      "has_callback", "no_such_month", "bad_code", "empty_city", "has_stamps", "not_president"]) {
    const m = says(new Error(code));
    assert.notEqual(m, code, `${code} 原封不動丟給人看`);
    assert.ok(!/[a-z]_[a-z]/.test(m), `${code} 翻出來的句子裡還有代碼`);
  }
  assert.match(says(new Error("Could not find the function public.save_activity(p_callback_to, ...)")), /2026-10-20-passport-admin\.sql/);
  assert.match(says(new Error("Could not find the function public.save_intern_task")), /2026-10-18-intern-admin\.sql/, "實習護照那條不能被蓋掉");
});

test("★ 主程式每一個幹部護照的動作成功或失敗都會寫 S.msg（畫面要有回饋）", () => {
  const src = readFileSync("admin/passports/src/main.js", "utf8");
  for (const act of ["act-save", "act-off", "act-del", "month-save", "dest-save", "dest-off"]) {
    const i = src.indexOf(`act === "${act}"`);
    assert.ok(i > 0, `找不到 ${act}`);
    const body = src.slice(i, src.indexOf("return;", src.indexOf("catch", i)));
    assert.match(body, /S\.busy = true/, `${act} 按下去沒有 busy`);
    assert.match(body, /S\.msg = /, `${act} 沒有回饋訊息`);
    assert.match(body, /D\.says\(err\)/, `${act} 失敗沒有翻譯錯誤`);
  }
  for (const act of ["act-off", "act-del", "dest-off"]) {
    const i = src.indexOf(`act === "${act}"`);
    assert.match(src.slice(i, i + 600), /confirm\(/, `${act} 會丟東西或藏東西，要先問一次`);
  }
});

test("★ 後台資料層寫入只走函式，不直接改 months / activities / destinations，而且完全不讀 entries", () => {
  const src = readFileSync("admin/passports/src/data.js", "utf8").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(src, /from\("(months|activities|destinations|stamps|visas)"\)\s*\.(insert|update|upsert|delete)/);
  assert.doesNotMatch(src, /from\("entries"\)/, "後台不該讀幹部的心得");
  assert.doesNotMatch(src, /from\("visas"\)/, "後台不該讀誰抽到哪個城市");
  const stamps = src.match(/from\("stamps"\)\s*\.select\("([^"]*)"\)/);
  assert.ok(stamps && stamps[1].trim() === "act_id", "stamps 只拿 act_id，不拿 user_id");
  for (const fn of ["save_activity", "set_activity_active", "delete_activity", "save_month_theme", "save_destination"])
    assert.ok(src.includes(`rpc("${fn}"`), `沒有呼叫 ${fn}`);
  assert.doesNotMatch(src, /rpc\("delete_destination"/);
});

test("★ 遷移檔：五支函式第一句都是 Co-President 的門，沒有刪城市的函式，三張表不發寫入權限", () => {
  const sql = readFileSync("supabase/migrations/2026-10-20-passport-admin.sql", "utf8").replace(/--[^\n]*/g, "");
  for (const fn of ["save_activity", "set_activity_active", "delete_activity", "save_month_theme", "save_destination"]) {
    const i = sql.indexOf(`create or replace function public.${fn}(`);
    assert.ok(i > 0, `找不到 ${fn}`);
    const body = sql.slice(i, sql.indexOf("end $$;", i));
    assert.match(body, /begin\s+(declare[\s\S]*?)?perform public\.require_president\(\);|begin\s+perform public\.require_president\(\);/, `${fn} 第一句不是門`);
    assert.match(sql.slice(i), new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`), `${fn} 沒有收掉 anon`);
  }
  assert.doesNotMatch(sql, /function public\.delete_destination/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^\n]*on (public\.)?(months|activities|destinations)/);
  assert.match(sql, /if not public\.is_president\(\) then/);
});
