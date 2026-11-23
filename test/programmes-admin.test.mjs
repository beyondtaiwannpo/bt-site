// 計畫（2026-12-31-programmes.sql）的後台那一半：活動編輯頁多的四格、清單上「什麼時候」那一句、網站上的活動那一頁。
// 跑法：node --test test/*.test.mjs
// 對外三頁（現在開放、這一年、團隊）不在這一支測，那是別的測試檔的事。這裡只守兩件：
//   1. 後台的純函式（月份怎麼收、patch 長什麼樣、畫出來的那一塊）。
//   2. 資料的約定：public_events() 原本 20 欄一欄不少、順序不變，最後面多四欄。對外頁靠這個順序與名字。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as FS from "../admin/src/strings.js";
import * as SITE from "../admin/site/src/ui.js";
import * as SS from "../admin/site/src/strings.js";

F.setLang("zh"); SITE.setLang("zh");
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const WS = "custom:event-winter-bootcamp";
const ASSOC = { id: "u2", role: "cadre", board: "member", team: "Marketing Team", name: "小安", senior: false, pres: false, ws: {} };
const EDITOR = { ...ASSOC, id: "u6", ws: { [WS]: "edit" } };
const PRES = { ...ASSOC, id: "u1", board: "president", senior: true, pres: true };
const EV = { id: "e1", slug: "winter-bootcamp", team: "Curriculum Team", workspace_id: WS, form_id: null, title_zh: "寒假探索營", title_en: "Winter College Bootcamp",
  summary_zh: "", summary_en: "", body_zh: "", body_en: "", cover_url: null, cover_consent: false,
  starts_at: null, ends_at: null, place: "", capacity: 0, status: "draft", published_at: null, source: "site",
  usual_month: 1, recurring: true, edition_zh: "Overseas Unpacked", edition_en: "Overseas Unpacked" };
// 遷移檔還沒跑的時候 loadEvents() 回來的列：沒有那四個鍵。
const OLD = (({ usual_month, recurring, edition_zh, edition_en, ...rest }) => rest)(EV);

test("evMonth：1 到 12 的整數才算，其他都當沒填", () => {
  for (const [v, want] of [[1, 1], [12, 12], ["8", 8], [" 3 ", 3], ["08", 8]]) assert.equal(F.evMonth(v), want, JSON.stringify(v));
  for (const v of [null, undefined, "", 0, 13, -1, 8.5, "八月", "abc", true, false, NaN]) assert.equal(F.evMonth(v), null, JSON.stringify(v));
});

test("evMonthName：中文「8 月」，英文 August；不是月份回空字串", () => {
  assert.equal(F.evMonthName(8), "8 月");
  assert.equal(F.evMonthName("12"), "12 月");
  assert.equal(F.evMonthName(13), "");
  F.setLang("en");
  assert.equal(F.evMonthName(8), "August");
  assert.equal(F.evMonthName(1), "January");
  F.setLang("zh");
});

test("evHasProgramme：列上有 recurring 這個鍵（布林）才算資料庫有那四欄", () => {
  assert.equal(F.evHasProgramme(EV), true);
  assert.equal(F.evHasProgramme({ ...EV, recurring: false }), true);
  assert.equal(F.evHasProgramme(OLD), false);
  assert.equal(F.evHasProgramme(null), false);
});

test("★ evProgrammePatch：表單上的值變成 save_event() 的四個鍵，月份沒選是 null、名字去掉頭尾空白", () => {
  assert.deepEqual(F.evProgrammePatch({ usual_month: "8", recurring: true, edition_zh: " 第三屆 ", edition_en: " Third edition " }),
    { usual_month: 8, recurring: true, edition_zh: "第三屆", edition_en: "Third edition" });
  assert.deepEqual(F.evProgrammePatch({ usual_month: "", recurring: false, edition_zh: "", edition_en: "" }),
    { usual_month: null, recurring: false, edition_zh: "", edition_en: "" });
  assert.deepEqual(F.evProgrammePatch({ usual_month: "13", recurring: "yes" }), { usual_month: null, recurring: false, edition_zh: "", edition_en: "" }, "亂填的月份當沒填，recurring 只認 true");
  assert.deepEqual(Object.keys(F.evProgrammePatch()), ["usual_month", "recurring", "edition_zh", "edition_en"], "鍵的名字就是資料庫欄位的名字");
});

test("evWhenLabel：有日期印日期，沒有就印通常幾月，再沒有才印多數年份都會辦", () => {
  // 2026-11-23：清單上印的是台灣時間（UTC 1 月 2 日 16:00 是台灣 1 月 3 日 00:00），跟編輯頁那一格同一個時間。以前印的是 UTC。
  assert.equal(F.evWhenLabel({ ...EV, starts_at: "2027-01-02T16:00:00+00:00" }), "2027-01-03 00:00", "有日期就不印月份");
  assert.equal(F.evWhenLabel({ ...EV, usual_month: 8 }), "通常 8 月");
  assert.equal(F.evWhenLabel({ ...EV, usual_month: null }), "多數年份都會辦");
  assert.equal(F.evWhenLabel({ ...EV, usual_month: null, recurring: false }), "");
  assert.equal(F.evWhenLabel(OLD), "", "遷移檔還沒跑的列不會壞");
  assert.equal(F.evWhenLabel(null), "");
  F.setLang("en");
  assert.equal(F.evWhenLabel({ ...EV, usual_month: 8 }), "usually August");
  F.setLang("zh");
});

test("★ 編輯頁那一塊：下拉是不填加 12 個月、選到的那個月、勾勾、兩格名字、三句說明", () => {
  const h = F.eventProgrammeHTML(EV, true, false);
  assert.equal((h.match(/<option /g) || []).length, 13);
  assert.match(h, /<select id="ev-month" name="usual_month">/);
  assert.match(h, /<option value="">不填<\/option>/);
  assert.match(h, /<option value="1" selected>1 月<\/option>/);
  assert.match(h, /<option value="12">12 月<\/option>/);
  assert.equal((h.match(/ selected/g) || []).length, 1, "只有一個被選到");
  assert.match(h, /<input type="checkbox" id="ev-recurring" name="recurring" checked>/);
  assert.match(h, /id="ev-edzh" name="edition_zh" value="Overseas Unpacked"/);
  assert.match(h, /id="ev-eden" name="edition_en" value="Overseas Unpacked"/);
  for (const s of ["通常在幾月", "多數年份都會辦", "這一屆叫什麼（中）", "這一屆叫什麼（英）",
    "只有沒填開始時間的時候才用得到：對外的「活動與計畫」頁會把它排在這個月，活動頁上寫大約幾月。填了開始時間就照日期排，這一格不用管。",
    "勾了，它會列在對外「團隊」頁那個 team 底下，當成每年固定會辦的計畫。",
    "填了，對外頁會用這個名字當大標題，原本的名稱放在旁邊。例如寒假探索營這一屆叫 Overseas Unpacked。可以不填。"]) assert.ok(h.includes(s), s);
  assert.doesNotMatch(h, /這一年/, "對外那一頁 2026-11-22 改名叫「活動與計畫」了");
  const none = F.eventProgrammeHTML({ ...EV, usual_month: null, recurring: false, edition_zh: "", edition_en: "" }, true, false);
  assert.match(none, /<option value="" selected>不填<\/option>/);
  assert.doesNotMatch(none, /id="ev-recurring" name="recurring" checked/);
});

test("編輯頁那一塊：使用者填的字有跳脫；存檔中整塊鎖住", () => {
  const h = F.eventProgrammeHTML({ ...EV, edition_zh: `"><script>x</script>` }, true, false);
  assert.doesNotMatch(h, /<script>/);
  const busy = F.eventProgrammeHTML(EV, true, true);
  assert.equal((busy.match(/ disabled/g) || []).length, 4, "下拉、勾勾、兩格名字");
});

test("★ 只有「看」的人：值看得到，下拉與勾勾是 disabled、兩格名字是 readonly", () => {
  const h = F.eventProgrammeHTML(EV, false, false);
  assert.match(h, /<select id="ev-month" name="usual_month" disabled>/);
  assert.match(h, /id="ev-recurring" name="recurring" checked disabled>/);
  assert.match(h, /id="ev-edzh" name="edition_zh" value="Overseas Unpacked" readonly>/);
  assert.match(h, /id="ev-eden" name="edition_en" value="Overseas Unpacked" readonly>/);
});

test("★ 遷移檔還沒跑：那幾格不畫，改一句話說要先跑哪一支", () => {
  const h = F.eventProgrammeHTML(OLD, true, false);
  assert.match(h, /2026-12-31-programmes\.sql/);
  assert.doesNotMatch(h, /ev-month|ev-recurring|ev-edzh|ev-eden/);
});

test("★ 整頁：那一塊在「改了就存」的容器裡面（存檔提示之前），沒有日期的計畫整頁畫得出來", () => {
  const h = F.eventEditHTML(EV, null, null, EDITOR, "", false);
  // 2026-11-23 重排：那一塊自己一段、自己一個「改了就存」的框（這一頁有四個，存的是同一條路）。
  const sec = h.indexOf('<section class="section" id="ev-listing">'), box = h.indexOf('data-autosave="ev-save"', sec), month = h.indexOf('id="ev-month"'), foot = h.indexOf('class="form-foot"', box);
  assert.ok(sec > 0 && box > sec && month > box && foot > month, "那一段 → 容器 → 四格 → 存檔提示");
  assert.ok(h.slice(box, month).indexOf('data-autosave') === 0 && !h.slice(box + 20, month).includes('data-autosave'), "四格跟容器之間沒有別的框");
  assert.match(h, /<section class="section" id="ev-listing"><h2>對外的「活動與計畫」頁和「團隊」頁上怎麼列<span class="hint">都可以不填<\/span><\/h2>/);
  assert.match(h, /id="ev-starts" name="starts_at" type="datetime-local" value=""/, "開始時間是空的也畫得出來");
  const view = F.eventEditHTML(EV, null, null, ASSOC, "", false);
  assert.doesNotMatch(view, /data-autosave="ev-save"/, "只有「看」的人沒有自動儲存的容器");
  assert.match(view, /<select id="ev-month" name="usual_month" disabled>/);
  assert.match(F.eventEditHTML(OLD, null, null, EDITOR, "", false), /2026-12-31-programmes\.sql/, "遷移檔還沒跑整頁照樣畫得出來");
});

test("清單：沒有日期的計畫印「通常 1 月」，有日期的照舊印日期", () => {
  const h = F.eventsListHTML([EV, { ...EV, id: "e2", slug: "dated", title_zh: "有日期的", starts_at: "2027-01-20T01:00:00Z", usual_month: 1 }], PRES, [], null, "", false, []);
  assert.match(h, /Curriculum・通常 1 月/);
  assert.match(h, /Curriculum・2027-01-20 09:00/, "台灣時間（UTC 01:00 是台灣 09:00）");
});

test("★ main.js 的接線：那一塊有畫才帶四個鍵；data.js 讀得到四欄、欄位不在就退回、有 bad_month 那一句", () => {
  const main = read("admin/src/main.js");
  assert.match(main, /if \(document\.getElementById\("ev-month"\)\) Object\.assign\(patch, UI\.evProgrammePatch\(\{ usual_month: val\("ev-month"\), recurring: chk\("ev-recurring"\), edition_zh: val\("ev-edzh"\), edition_en: val\("ev-eden"\) \}\)\);/);
  const data = read("admin/src/data.js");
  assert.match(data, /EV_PROGRAMME_COLS = "usual_month, recurring, edition_zh, edition_en"/);
  assert.match(data, /String\(error\.code\) === "42703"\) \(\{ data, error \} = await q\(EV_COLS\)\)/, "遷移檔還沒跑，活動清單照樣打得開");
  assert.match(data, /\["bad_month", /);
  assert.match(data, /\["need_start", "[^"]*通常在幾月[^"]*多數年份都會辦/, "擋下來的那一句有講另外兩條路");
  for (const id of ["ev-month", "ev-recurring", "ev-edzh", "ev-eden"]) assert.ok(F.eventProgrammeHTML(EV, true, false).includes(`id="${id}"`), id + " 畫面上有，main.js 才讀得到");
});

test("字典：新加的每一句中英文都有，沒有破折號", () => {
  const keys = ["ev.pg", "ev.month", "ev.monthNone", "ev.monthN", "ev.monthHelp", "ev.recurring", "ev.recurringHelp", "ev.editionZh", "ev.editionEn", "ev.editionHelp", "ev.pgNeedsSql", "ev.usualIn", "ev.recurringTag"];
  for (const [mod, list] of [[FS, keys], [SS, ["se.usualIn", "se.recurring"]]]) {
    for (const k of list) {
      mod.setLang("zh"); const zh = mod.T(k, { m: 8, name: "August" });
      mod.setLang("en"); const en = mod.T(k, { m: 8, name: "August" });
      assert.notEqual(zh, k, k + " 有中文"); assert.notEqual(en, k, k + " 有英文");
      assert.ok(zh && en && !/[\u2014\u2013]/.test(zh + en), k);
    }
    mod.setLang("zh");
  }
});

test("網站上的活動那一頁：沒有日期的印通常幾月或多數年份都會辦，都沒有才是還沒定日期", () => {
  assert.equal(SITE.siteEventWhen({ starts_at: null, usual_month: 8, recurring: true }), "通常 8 月");
  assert.equal(SITE.siteEventWhen({ starts_at: null, usual_month: null, recurring: true }), "多數年份都會辦，沒有固定日期");
  assert.equal(SITE.siteEventWhen({ starts_at: null, usual_month: null, recurring: false }), "還沒定日期");
  assert.equal(SITE.siteEventWhen({ starts_at: null }), "還沒定日期", "遷移檔還沒跑的列照舊");
  assert.equal(SITE.siteEventWhen({ starts_at: null, usual_month: 13 }), "還沒定日期");
  assert.match(SITE.siteEventWhen({ starts_at: "2027-01-03T00:00:00+08:00", usual_month: 1 }), /2027/, "有日期就印日期");
  const g = SITE.siteEventGroups([{ slug: "a", status: "published", starts_at: null, ends_at: null, usual_month: 8 }], new Date("2030-01-01"));
  assert.equal(g.live.length, 1, "沒有日期的計畫不會被當成結束了");
});

test("★ 網站上的活動那一頁：「到活動頁」連的是代號（活動頁照代號找，連 id 會找不到）", () => {
  const h = SITE.siteEventsHTML([{ id: "0b6f0000-0000-4000-8000-000000000001", slug: "mentor-matching", team: "Mentorship Team", title_zh: "Mentor 配對", title_en: "Mentor matching", starts_at: null, ends_at: null, place: "", status: "published", usual_month: null, recurring: true }], "");
  assert.match(h, /\/admin\/\?lang=zh#events\/mentor-matching"/);
  assert.doesNotMatch(h, /#events\/0b6f0000/);
  assert.match(h, /多數年份都會辦，沒有固定日期/);
});

// ── 資料的約定（對外三頁靠這個）──
const cols = sql => { const m = /function public\.public_events\(\)\s*returns table \(([^)]*)\)/.exec(sql); return m ? m[1].split(",").map(s => s.trim().replace(/\s+/g, " ")) : null; };
test("★ public_events()：原本 20 欄一欄不少、順序不變，最後面多 usual_month、recurring、edition_zh、edition_en", () => {
  const was = cols(read("supabase/migrations/2026-11-01-events.sql")), now = cols(read("supabase/migrations/2026-12-31-programmes.sql"));
  assert.equal(was.length, 20); assert.equal(now.length, 24);
  assert.deepEqual(now.slice(0, 20), was);
  assert.deepEqual(now.slice(20), ["usual_month smallint", "recurring boolean", "edition_zh text", "edition_en text"]);
});

test("★ 遷移檔：對外兩支先 drop 再建、權限照原樣重發、只回 published、is_past 不回空的、沒有日期的排最後", () => {
  const sql = read("supabase/migrations/2026-12-31-programmes.sql").replace(/--[^\n]*/g, "");
  assert.match(sql, /drop function if exists public\.public_event\(text\);\s*drop function if exists public\.public_events\(\);/);
  assert.match(sql, /revoke all on function public\.public_events\(\), public\.public_event\(text\) from public;\s*grant execute on function public\.public_events\(\), public\.public_event\(text\) to anon, authenticated;/);
  assert.match(sql, /where e\.status = 'published'/);
  // 只知道日期的（台灣半夜十二點、沒有結束時間）整個那一天都還不算過去；其他的照舊；兩個時間都沒有的回 false 不回空的。
  assert.match(sql, /coalesce\(coalesce\(e\.ends_at,\s*case when \(e\.starts_at at time zone 'Asia\/Taipei'\)::time = time '00:00' then e\.starts_at \+ interval '1 day' else e\.starts_at end\) < now\(\), false\) as is_past/);
  assert.match(sql, /order by e\.starts_at nulls last/);
  assert.equal((sql.match(/security definer\s+set search_path = public, pg_temp/g) || []).length, 4, "四支函式都是 security definer、search_path 鎖著");
  assert.doesNotMatch(sql, /create policy|drop policy|alter policy|disable row level security|grant [^;]* on (table )?public\.events/i, "這一支不碰 RLS、不多開表的權限");
});

test("遷移檔：seed 五筆、代號撞到就跳過、日期只有寒假探索營那一筆、整段用線框著可以刪", () => {
  const raw = read("supabase/migrations/2026-12-31-programmes.sql");
  const a = raw.indexOf("▼▼▼ seed 從這裡開始"), b = raw.indexOf("▲▲▲ seed 到這裡結束");
  assert.ok(a > 0 && b > a, "有頭有尾");
  const seed = raw.slice(a, b);
  for (const slug of ["winter-bootcamp", "intern-intake", "mentor-matching", "coffee-chat", "essay-ecosystem"]) assert.ok(seed.includes(`('${slug}',`), slug);
  assert.equal((seed.match(/^\s*\('[a-z-]+',/gm) || []).length, 5, "就五筆");
  assert.match(seed, /on conflict \(slug\) do nothing/);
  assert.match(seed, /'winter-bootcamp', 'Curriculum Team', '寒假探索營',\s+'Winter College Bootcamp',\s+'Overseas Unpacked', 'Overseas Unpacked', true, 1,\s+'2027-01-03 00:00\+08'\)/);
  assert.match(seed, /'intern-intake',\s+'Internship Team', '高中生實習招募', 'High school intern intake',\s+'',\s+'',\s+true, 8,\s+null\)/);
  for (const s of ["'mentor-matching', 'Mentorship Team', 'Mentor 配對',", "'coffee-chat',     'Mentorship Team', 'Coffee chat',", "'essay-ecosystem', 'Mentorship Team', 'Essay ecosystem',"]) assert.ok(seed.includes(s), s);
  assert.equal((seed.match(/true, null, null\)/g) || []).length, 3, "Mentorship 那三筆沒月份也沒日期");
  const rest = raw.slice(0, a) + raw.slice(b);
  assert.doesNotMatch(rest.replace(/--[^\n]*/g, ""), /_programme_seed/, "seed 用到的東西都在框裡面，刪掉不會留半截");
});

test("smoke.sh 有跑這一支（本機資料庫那一半靠它）", () => {
  assert.match(read("scripts/db/smoke.sh"), /supabase\/migrations\/2026-12-31-programmes\.sql/);
});
