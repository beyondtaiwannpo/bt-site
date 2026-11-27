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

test("★ 側欄四份都有「會議」（幹部都看得到）；誰能排哪些範圍：senior 全部、team 是「改」以上的那幾個 team、Associate 沒有", () => {
  for (const X of [F, SITE, PA, PE]) { const it = X.ITEMS.find(i => i.key === "meetings"); assert.equal(it.who, "cadre"); assert.ok(X.canSee(it, ME)); }
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
  assert.match(h, /<option value="60" selected>60 分鐘<\/option>/);
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

test("勾或取消出席的人，人數與送出鈕的數字跟著變（Paul 2026-10-28 回報數字不動）；打字不重畫", () => {
  const h = SCH.scheduleHTML({ min: 660, ticked: ["u1"] }, sctx(), false);
  assert.match(h, /<i id="sch-who-n">/, "人數那一行有 id，change 才改得到");
  assert.match(h, /id="sch-send" data-act="sch-send"/, "送出鈕有 id");
  const m = readFileSync("home/src/main.js", "utf8");
  const f = m.slice(m.indexOf("function onSchInput(e)"), m.indexOf("function schCount()"));
  assert.match(f, /t\.name === "sch-member"[\s\S]*schCount\(\); return;/, "勾人只改數字，不重畫");
  assert.match(f, /k === "q"[\s\S]*\.hidden = !ok/, "找名字只藏列，不重畫（游標不跳）");
  assert.match(f, /e\.type === "change" && \(k === "min" \|\| k === "minutes" \|\| k === "scope"\)/, "只有換時間、長度、範圍才重畫");
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
