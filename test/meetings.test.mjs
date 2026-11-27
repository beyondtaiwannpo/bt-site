// 會議紀錄與排會（2026-11-02，docs/2026-10-24-會議與排程.md）。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as SITE from "../admin/site/src/ui.js";
import * as PA from "../admin/passports/src/ui.js";
import * as PE from "../admin/people/src/ui.js";
// 排會 2026-11-26 從時間看板搬到首頁行事曆的某一天（home/src/schedule.js、free.js）；.ics 是首頁下載的那一份（home/src/ui.js）。
import * as HUI from "../home/src/ui.js";
import * as SCH from "../home/src/schedule.js";
import * as FREE from "../home/src/free.js";
import * as HS from "../home/src/strings.js";

F.setLang("zh"); SITE.setLang("zh"); HS.setLang("zh");
const ME = { id: "u2", role: "cadre", board: "member", team: "Curriculum Team", name: "小安", senior: false, pres: false, ws: {} };
const DIR = { ...ME, id: "u5", board: "director", team: "Marketing Team", ws: { "res:Marketing Team": "manage" } };
const PRES = { ...ME, id: "u1", board: "president", senior: true, pres: true };
const PEOPLE = [{ id: "u1", name_zh: "王平", name_en: "Paul", board_role: "president", team: "" }, { id: "u2", name_zh: "小安", name_en: "Ann", board_role: "member", team: "Curriculum Team" }, { id: "u5", name_zh: "雅婷", name_en: "Tina", board_role: "director", team: "Marketing Team" }];
const future = new Date(Date.now() + 5 * 86400000).toISOString(), futureEnd = new Date(Date.now() + 5 * 86400000 + 3600000).toISOString();
const past = new Date(Date.now() - 5 * 86400000).toISOString(), pastEnd = new Date(Date.now() - 5 * 86400000 + 3600000).toISOString();
const M = [
  { id: "11111111-1111-4111-8111-111111111111", scope: "Marketing Team", title: "Marketing 週會", starts_at: future, ends_at: futureEnd, agenda: "海報進度", doc_url: "https://docs.google.com/document/d/abc", attendees: [{ user_id: "u1", status: "accepted" }, { user_id: "u2", status: "invited" }, { user_id: "u5", status: "declined" }] },
  { id: "22222222-2222-4222-8222-222222222222", scope: "board", title: "Board 月會", starts_at: past, ends_at: pastEnd, agenda: "", doc_url: null, attendees: [{ user_id: "u1", status: "accepted" }] },
];

const DAY = { "custom:calendar": "edit", "custom:meetings": "edit", "custom:projects": "edit", "custom:forms": "edit", "custom:my-passport": "edit", "custom:venues": "edit" };  // 2027-01-24：整個 BT 每天用的六樣

test("★ 側欄四份都有「會議」（幹部都看得到）；誰能排哪些範圍：senior 全部、team 是「改」以上的那幾個 team、Associate 沒有", () => {
  for (const X of [F, SITE, PA, PE]) { const it = X.ITEMS.find(i => i.key === "meetings"); assert.equal(it.who, "ws:custom:meetings"); assert.ok(X.canSee(it, { ...ME, ws: DAY })); assert.ok(!X.canSee(it, { ...ME, ws: {} }), "2027-01-24：沒被派進會議的看不到"); }
  assert.deepEqual(F.mtScopes(PRES, ["Marketing Team"]), ["board", "Marketing Team"]);
  assert.deepEqual(F.mtScopes(DIR, []), ["Marketing Team"]);
  assert.deepEqual(F.mtScopes(ME, []), []);
  assert.deepEqual(SCH.scopesFor(true, {}, ["A Team"]), ["board", "A Team"]);
  assert.deepEqual(SCH.scopesFor(false, { "res:Marketing Team": "manage", "res:Curriculum Team": "edit", "res:Sponsorship Team": "view", apps: "manage" }, []), ["Marketing Team", "Curriculum Team"]);
});

test("清單：之後的與過去的分開、每一列人數與會到數、紀錄連結、我的回覆狀態；「記一場會議」自己一頁（2026-11-26 搬到首頁），能排的人才有表單", () => {
  const h = F.meetingsListHTML(M, ME, ["Marketing Team"], null, PEOPLE, "", false);
  assert.match(h, /<h2>之後的<span class="hint">1<\/span>/); assert.match(h, /<h2>過去的<span class="hint">1<\/span>/);
  assert.match(h, /data-act="mt-open" data-id="11111111-1111-4111-8111-111111111111">Marketing 週會<\/a>/);
  assert.match(h, /3 人，1 人說會到/); assert.match(h, /href="https:\/\/docs.google.com\/document\/d\/abc"[^>]*>會議紀錄<\/a>/);
  assert.match(h, /<span class="tag">還沒回<\/span>/, "我在名單上、還沒回");
  assert.doesNotMatch(h, /mt-save|id="mt-new"/, "清單頁上不再有記一場會議那一格");
  const n = F.meetingNewHTML(["Marketing Team"], null, PEOPLE, "", false, null);
  assert.match(n, /<h1>記一場會議<\/h1>/); assert.match(n, /data-act="mt-back"/, "回得去會議清單");
  assert.match(n, /data-act="mt-save" data-id=""/); assert.match(n, /<select id="mt-scope"[^>]*><option value="Marketing Team" selected>Marketing<\/option>/);
  const no = F.meetingNewHTML([], null, PEOPLE, "", false, null);
  assert.doesNotMatch(no, /mt-save/, "不能排的人沒有那張表單"); assert.match(no, /你現在記不了會議/);
  assert.match(F.meetingsListHTML([], ME, [], null, PEOPLE, "", false), /之後沒有排好的會/);
});

test("一場會議：議程、紀錄、出席分三欄（會到、還沒回、不能到）；能排的人底下可以改與刪，名單預勾現有的人", () => {
  const h = F.meetingHTML(M[0], ME, PEOPLE, true, ["Marketing Team"], { pk: { ticked: ["u1", "u2", "u5"] } }, "", false);
  assert.match(h, /<h1>Marketing 週會<\/h1>/); assert.match(h, /<dt>一行議程<\/dt><dd>海報進度<\/dd>/);
  assert.match(h, /<i>會到（1）<\/i><ul class="plain"><li><span class="nm"><b>王平<\/b>/);
  assert.match(h, /<i>還沒回（1）<\/i>[\s\S]*?<b>小安<\/b>[\s\S]*?這是你/);
  assert.match(h, /<i>不能到（1）<\/i>[\s\S]*?<b>雅婷<\/b>/);
  assert.match(h, /data-autosave="mt-save" data-id="11111111-1111-4111-8111-111111111111"/); assert.match(h, /class="autosave" data-for="mt-save"/, "2026-11-06 起既有那一場改了就存"); assert.doesNotMatch(h, /data-act="mt-save"/); assert.match(h, /data-act="mt-delete"/);
  assert.match(h, /在名單上（3）/, "名單那一塊預勾現有的三位，Co-President 也勾得到");
  const ro = F.meetingHTML(M[1], ME, PEOPLE, false, [], null, "", false);
  assert.doesNotMatch(ro, /mt-save|mt-delete/); assert.match(ro, /還沒貼（開完會把 Docs 連結貼上）/);
});

test("總覽的卡：我在名單上、還沒開的下一場；沒有就沒有這張卡", () => {
  const cards = me => F.todoCards(me, [], [], { meetings: M, roster: [], resources: [], workspaces: [] }, false, false).map(c => `${c.label}|${c.n}|${c.hint}`);
  assert.ok(cards(ME).some(c => c.startsWith("你的下一場會|1|「Marketing 週會」")), cards(ME).join("\n"));
  assert.ok(!cards({ ...ME, id: "u9" }).some(c => c.startsWith("你的下一場會")));
});

// 某一天 2026-11-26 11:00 起（台北），u1 整個小時有空、u2 只有前半小時、u5 沒空。
const DAYKEY = "2026-11-26", TZ = "Asia/Taipei";
const MEMBERS = [{ id: "u1", name: "王平", alt: "Paul", board_role: "president", team: "" }, { id: "u2", name: "小安", alt: "Ann", board_role: "member", team: "Curriculum Team" }, { id: "u5", name: "雅婷", alt: "Tina", board_role: "director", team: "Marketing Team, Sponsorship Team" }];
const FREEMAP = new Map([[660, ["u1", "u2"]], [690, ["u1"]]]);
const sctx = over => Object.assign({ key: DAYKEY, rows: FREE.dayRows(DAYKEY, TZ), free: FREEMAP, members: MEMBERS, scopes: ["Marketing Team"], now: new Date("2026-11-25T00:00:00Z") }, over || {});

test("行事曆的某一天排一場會：整段有空的先勾、只有一部分有空的另外標、找名字只藏不刪、送出鈕算人數；多了開始時間與留言", () => {
  assert.deepEqual(SCH.preTicked(FREEMAP, 660, 60), ["u1"], "整個小時都有空的才先勾");
  assert.deepEqual(SCH.preTicked(FREEMAP, 660, 30).sort(), ["u1", "u2"]);
  const h = SCH.scheduleHTML({ min: 660, minutes: 60, ticked: ["u1"], q: "", title: "BT 會議" }, sctx(), false);
  assert.match(h, /value="u1" checked><b>王平<\/b><span class="alt">Paul<\/span><span class="rk">CP<\/span><span class="mini free">有空<\/span>/, "一列：名字、英文、職級標、有空");
  assert.match(h, /value="u2"><b>小安<\/b><span class="alt">Ann<\/span><span class="rk">AS<\/span><span class="mini">Curriculum<\/span><span class="mini part">部分時間有空<\/span>/, "只有前半小時有空");
  assert.match(h, /value="u5"><b>雅婷<\/b><span class="alt">Tina<\/span><span class="rk">DR<\/span><span class="mini">Marketing<\/span> <span class="mini">Sponsorship<\/span><\/label>/, "team 淡字不帶 Team 那個字、沒空就沒有標");
  assert.ok(h.indexOf('value="u1"') < h.indexOf('value="u2"') && h.indexOf('value="u2"') < h.indexOf('value="u5"'), "有空的排前面");
  assert.match(h, /<select id="sch-min" data-sch="min"[^>]*>[\s\S]*<option value="660" selected>11:00<\/option>/, "開始時間是點的那一格，改得了");
  assert.match(h, /<select id="sch-end" data-sch="end"[^>]*><option value="690">11:30<\/option><option value="720" selected>12:00<\/option>/, "結束時間從開始後半小時起算");
  assert.match(h, /<p class="mini len" id="sch-len">長度 1 小時<\/p>/, "長度自己算出來");
  assert.match(h, /<input type="date" id="sch-key" data-sch="key" value="2026-11-26"/, "日期改得了");
  assert.match(h, /<textarea id="sch-message" data-sch="message"/, "留言一格");
  assert.match(h, /data-act="sch-send">排會並寄邀請（1 人）<\/button>/);
  assert.match(h, /BT 的 Google 帳號開這場會，自動加一個 Google Meet 連結/);
  const q = SCH.scheduleHTML({ min: 660, ticked: [], q: "tina" }, sctx(), false);
  assert.match(q, /<label class="check sch-row" hidden><input type="checkbox" name="sch-member" value="u1"/, "找名字只是藏起來，勾過的不會不見");
  assert.doesNotMatch(q, /<label class="check sch-row" hidden><input type="checkbox" name="sch-member" value="u5"/);
  assert.match(q, /data-act="sch-send" disabled/, "沒勾人送不出去");
  assert.match(readFileSync("home/src/data.js", "utf8"), /select\("id, name_zh, name_en, team, tz, board_role"\)/, "名單帶職級與時區");
  const m = readFileSync("home/src/main.js", "utf8");
  assert.match(m, /D\.scheduleMeeting\(/); assert.match(m, /act === "day-pick"/);
  assert.match(m, /message: \(d\.message \|\| ""\)\.trim\(\)/, "留言送進資料庫");
  // 時間看板只剩「我的時間」與「成員」，舊連結轉到首頁行事曆；回覆 2026-10-28 就搬到 /home/ 了。
  const av = readFileSync("availability/src/main.js", "utf8");
  assert.match(av, /location\.replace\("\.\.\/home\/\?" \+ q\.toString\(\) \+ "#calendar"\)/);
  assert.match(av, /location\.replace\("\.\.\/home\/\?meeting="/); assert.doesNotMatch(av, /act === "rsvp"|act === "sch-|act === "peek"/);
});

test("資料層：排會帶留言；資料庫還沒跑 2027-01-22 那支就退回舊的叫法，留言接到議程最前面不會不見", () => {
  const d = readFileSync("home/src/data.js", "utf8");
  assert.match(d, /rpc\("schedule_meeting", Object\.assign\(\{\}, args, \{ p_message: d\.message \|\| "" \}\)\)/);
  assert.match(d, /Could not find the function\|PGRST202/);
  assert.match(d, /p_agenda: msg \? msg \+/);
  assert.match(d, /MEET_COLS_M = "[^"]*, message"/, "首頁讀得到留言");
});

test("★ .ics 照 RFC 5545 的基本規矩：CRLF、必要欄位、UTC Z、跳脫、折行不超過 75 個位元組；跟資料庫那一份同一個形狀", () => {
  // 2026-11-26：看板那一份 .ics（availability/src/calendar.js）跟著團隊看板拿掉，這裡守首頁下載的那一份。
  // 舊的那一份分號沒有跳脫（JS 的 "\;" 其實就是 ";"），測試也跟著寫成沒跳脫；首頁這一份照 RFC 5545 寫成 \;。
  const ics = HUI.icsText({ id: "m1", start: new Date("2027-03-01T02:00:00Z"), end: new Date("2027-03-01T03:00:00Z"), title: "Marketing 週會; 第二季", agenda: "海報進度, 嘖嘖頁\n分工", doc_url: "https://docs.google.com/document/d/abc" }, new Date("2026-10-24T00:00:00Z"));
  assert.ok(ics.endsWith("\r\n")); assert.ok(!/[^\r]\n/.test(ics), "每一行 CRLF");
  const lines = ics.split("\r\n").filter(Boolean);
  assert.equal(lines[0], "BEGIN:VCALENDAR"); assert.equal(lines[lines.length - 1], "END:VCALENDAR");
  for (const l of ["VERSION:2.0", "PRODID:-//Beyond Taiwan//bt-site//EN", "METHOD:PUBLISH", "BEGIN:VEVENT", "UID:meeting-m1@beyondtaiwannpo.com", "DTSTAMP:20261024T000000Z", "DTSTART:20270301T020000Z", "DTEND:20270301T030000Z", "SUMMARY:Marketing 週會\\; 第二季", "DESCRIPTION:海報進度\\, 嘖嘖頁\\n分工", "URL:https://docs.google.com/document/d/abc", "END:VEVENT"]) assert.ok(lines.includes(l), "少了 " + l);
  const enc = new TextEncoder();
  for (const l of ics.split("\r\n")) assert.ok(enc.encode(l).length <= 75, "超過 75 位元組：" + l);
  const long = HUI.icsText({ id: "x", start: new Date(0), end: new Date(3600000), title: "很長的標題".repeat(20) });
  assert.ok(long.split("\r\n").every(l => enc.encode(l).length <= 75)); assert.match(long, /\r\n /, "長行有折（下一行開頭一個空白）");
  const sql = readFileSync("supabase/migrations/2026-11-02-meetings.sql", "utf8");
  for (const s of ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Beyond Taiwan//bt-site//EN", "METHOD:PUBLISH", "'UID:meeting-'", "DTSTAMP:", "DTSTART:", "DTEND:", "SUMMARY:", "DESCRIPTION:", "'URL:'", "END:VEVENT", "END:VCALENDAR", "YYYYMMDD\"T\"HH24MISS\"Z\""]) assert.ok(sql.includes(s), "資料庫那一份少了 " + s);
  assert.match(sql, /'attachments', jsonb_build_array\(jsonb_build_object\(\s*'filename', 'meeting\.ics'/, "send_pending_mail 帶附件");
  assert.match(sql, /if exists \(select 1 from pg_extension where extname = 'pg_cron'\)/, "pg_cron 有開才排");
});

test("信件文案多兩種；admin 開頁叫 tick_mail；資料層只走函式", () => {
  assert.ok(["meeting_invite", "meeting_reminder"].every(v => SITE.MAIL_KINDS.some(k => k.v === v)));
  assert.equal(SITE.fillMeeting("{name}|{title}|{when}|{agenda}|{doc}|{link}", { name: "A", title: "B", when: "C", agenda: "D", doc: "E", link: "F" }), "A|B|C|D|E|F");
  const d = readFileSync("admin/src/data.js", "utf8"), m = readFileSync("admin/src/main.js", "utf8");
  assert.match(d, /rpc\("save_meeting"/); assert.match(d, /rpc\("delete_meeting"/); assert.match(d, /rpc\("tick_mail"\)/);
  assert.doesNotMatch(d, /from\("meetings"\)\s*\.(insert|update|delete)/);
  assert.match(m, /D\.tickMail\(\)\.catch\(\(\) => \{\}\)/);
  assert.match(m, /UI\.needAsk\(S, b, T\("confirm\.mtDelete"/);
});

test("★ 英文畫出來不剩中文（會議清單、一場會議、行事曆排會）", () => {
  F.setLang("en"); HS.setLang("en");
  const members = [{ id: "u1", name: "Paul", alt: "" }];
  for (const h of [F.meetingsListHTML(M, ME, ["Marketing Team"], null, PEOPLE, "", false), F.meetingNewHTML(["Marketing Team"], null, PEOPLE, "", false, null), F.meetingHTML(M[0], ME, PEOPLE, true, ["Marketing Team"], null, "", false),
    SCH.scheduleHTML({ min: 600, ticked: [] }, sctx({ scopes: ["board"], members, free: new Map() }), false)]) {
    const text = h.replace(/<[^>]+>/g, " ").replace(/Marketing 週會|Board 月會|海報進度|王平|小安|雅婷/g, "");
    assert.doesNotMatch(text, /[一-鿿]/, "英文模式不該剩中文：" + (text.match(/[^\s]*[一-鿿]+[^\s]*/) || [""])[0]);
  }
  F.setLang("zh"); HS.setLang("zh");
});

// 2026-11-27 Paul：「It's gonna show up at like the end of her ticking, says she's available… If it's not, then it's something else」。
test("★ 每一個人後面一個標：有空、部分時間有空、沒空、沒填時間，跟著選的時間變；有空的排前面", () => {
  const filled = FREE.filledIds([{ id: "u1", tz: TZ }, { id: "u2", tz: TZ }, { id: "u5", tz: TZ }, { id: "u7", tz: null }],
    new Map([["u1", new Set(["4:660"])], ["u2", new Set(["4:660"])], ["u7", new Set(["4:660"])]]), new Map([["u5", new Set(["2026-11-23"])]]));
  assert.deepEqual([...filled].sort(), ["u1", "u2", "u5"], "u5 只動過一週也算填過；u7 沒設時區算不出來，當沒填");
  const four = MEMBERS.concat([{ id: "u7", name: "阿明", alt: "", board_role: "member", team: "" }]);
  const h = SCH.scheduleHTML({ key: DAYKEY, min: 660, minutes: 60, ticked: [] }, sctx({ members: four, filled }), false);
  assert.match(h, /value="u1"[^]*?<span class="mini free">有空<\/span><\/label>/);
  assert.match(h, /value="u2"[^]*?<span class="mini part">部分時間有空<\/span><\/label>/);
  assert.match(h, /value="u5"[^]*?<span class="mini busy">沒空<\/span><\/label>/, "填過時間、這一段沒空");
  assert.match(h, /value="u7"[^]*?<span class="mini none">沒填時間<\/span><\/label>/, "沒填過時間的另外一個標，不跟沒空混在一起");
  const order = ["u1", "u2", "u5", "u7"].map(id => h.indexOf(`value="${id}"`));
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, "有空、一部分、沒空、沒填");
  assert.match(h, /class="mini sch-key"/, "四個標上面有一行說明");
  // 換一個時間，標跟著變：11:30 起半小時只有 u1 有空，u2 變成沒空。
  const later = SCH.scheduleHTML({ key: DAYKEY, min: 690, minutes: 30, ticked: [] }, sctx({ members: four, filled }), false);
  assert.match(later, /value="u2"[^]*?<span class="mini busy">沒空<\/span>/);
  assert.equal(SCH.statusOf("x", new Set(), new Set(), null), "", "名單還在讀就不標沒空或沒填");
  assert.match(SCH.scheduleHTML({ min: 660 }, sctx({ members: null }), false), /正在讀大家有空的時間/);
  assert.match(SCH.scheduleHTML({ min: 660 }, sctx({ members: [], failed: true }), false), /讀不到名單與大家有空的時間/);
});

test("長度自己算：開始到結束；結束可以選到 24:00", () => {
  assert.equal(SCH.lenText(30), "30 分鐘"); assert.equal(SCH.lenText(120), "2 小時"); assert.equal(SCH.lenText(90), "1 小時 30 分");
  assert.deepEqual(SCH.endChoices(1350), [1380, 1410, 1440]);
  HUI.setLang("en");
  try { assert.equal(SCH.lenText(90), "1 h 30 min"); } finally { HUI.setLang("zh"); }
});

// 2026-11-27 Paul：月曆點一個日期直接跳出排會；週曆拖一段時間排會。
test("★ 月曆點日期直接排會、週曆拖一段排會：能排會的人才有，過去的日子沒有", () => {
  const ctx = can => ({ now: new Date("2026-11-26T04:00:00Z"), tz: TZ, canSchedule: can });
  const month = HUI.calendarHTML([], ctx(true), { view: "month", at: "2026-11-26", mode: "mine" });
  assert.match(month, /<div class="day today pick" data-act="cal-new" data-k="2026-11-26">/, "今天整格點得到");
  assert.match(month, /<div class="day pick" data-act="cal-new" data-k="2026-11-27">/);
  assert.match(month, /<div class="day">\s*<button type="button" class="dnum" data-act="cal-new" data-k="2026-11-25">25<\/button>/, "過去的日子整格不點，日期照舊打開那一天");
  assert.match(month, /點一個日期就能排會/);
  const view = HUI.calendarHTML([], ctx(false), { view: "month", at: "2026-11-26", mode: "mine" });
  assert.doesNotMatch(view, /class="day[^"]*pick/); assert.doesNotMatch(view, /點一個日期就能排會/);
  const week = HUI.calendarHTML([], ctx(true), { view: "week", at: "2026-11-26", mode: "mine" });
  assert.match(week, /<div class="wcol today pick" data-k="2026-11-26">/); assert.match(week, /<div class="wcol" data-k="2026-11-24">/);
  assert.match(week, /拖一段時間就能排會/);
  const m = readFileSync("home/src/main.js", "utf8");
  assert.match(m, /if \(act === "cal-new"\)[^]*?ctx\(\)\.canSchedule && k >= today[^]*?openSch\(k, m, 60\)/, "月曆點日期：不先勾人");
  assert.match(m, /addEventListener\("pointerdown"[^]*?\.wcol\.pick\[data-k\]/);
  assert.match(m, /addEventListener\("pointerup"[^]*?instantOf\(d\.k, s, S\.tz\)[^]*?openSch\(d\.k, s, minutes, \{ pre: true \}\)/, "放開就打開排會，過去的時間擋下來");
  assert.match(m, /addEventListener\("pointercancel", endDrag\)/, "手機捲動不會誤開");
});

test("會議清單上面也有「記一場會議」（2026-11-27 Paul：首頁有、會議那一頁卻沒有很怪）；排不了會的人沒有", () => {
  assert.match(F.meetingsListHTML(M, ME, ["Marketing Team"], null, PEOPLE, "", false), /<div class="actions"><a class="btn" href="#meetings\/new">記一場會議<\/a><\/div>/);
  assert.doesNotMatch(F.meetingsListHTML(M, ME, [], null, PEOPLE, "", false), /href="#meetings\/new"/);
});

test("勾或取消出席的人，人數與送出鈕的數字跟著變（Paul 2026-10-28 回報數字不動）；打字不重畫", () => {
  const h = SCH.scheduleHTML({ min: 660, ticked: ["u1"] }, sctx(), false);
  assert.match(h, /<i id="sch-who-n">/, "人數那一行有 id，change 才改得到");
  assert.match(h, /id="sch-send" data-act="sch-send"/, "送出鈕有 id");
  const m = readFileSync("home/src/main.js", "utf8");
  const f = m.slice(m.indexOf("function onSchInput(e)"), m.indexOf("function schCount()"));
  assert.match(f, /t\.name === "sch-member"[\s\S]*schCount\(\); return;/, "勾人只改數字，不重畫");
  assert.match(f, /k === "q"[\s\S]*\.hidden = !ok/, "找名字只藏列，不重畫（游標不跳）");
  assert.match(f, /k === "end" \|\| k === "min" \|\| k === "key"[\s\S]*if \(e\.type !== "change"\) return;[\s\S]*render\(\); return;/, "換日期、開始、結束才重畫");
  assert.match(f, /k === "min"\) \{ d\.min = Number\(t\.value\); d\.minutes = Math\.max\(30, Math\.min\(d\.minutes, 1440 - d\.min\)\)/, "改開始時間長度不變");
  assert.match(f, /k === "end"\) d\.minutes = Math\.max\(30, Number\(t\.value\) - d\.min\)/, "改結束時間長度跟著變");
  assert.match(f, /e\.type === "change" && k === "scope"/, "換範圍也重畫");
  const c = m.slice(m.indexOf("function schCount()"), m.indexOf("function schCount()") + 400);
  assert.match(c, /sch-who-n/); assert.match(c, /T\("sch\.send"/); assert.match(c, /b\.disabled = !n/);
  assert.match(m, /document\.addEventListener\("input", onSchInput\)/); assert.match(m, /document\.addEventListener\("change", onSchInput\)/);
});

test("寄信修好：send_pending_mail 的 r 是 mail_outbox 的型別（11-05 那一版用 record，每封信都 cannot cast）", () => {
  const s = readFileSync("supabase/migrations/2026-11-11-fix-mail-send.sql", "utf8");
  assert.match(s, /r public\.mail_outbox%rowtype; v_key text;/);
  assert.doesNotMatch(s, /^\s*r record;/m);
  assert.match(readFileSync("scripts/db/smoke.sh", "utf8"), /2026-11-11-fix-mail-send\.sql/, "smoke 有跑這一支");
});
