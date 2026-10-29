// 會議紀錄與排會（2026-11-02，docs/2026-10-24-會議與排程.md）。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as SITE from "../admin/site/src/ui.js";
import * as PA from "../admin/passports/src/ui.js";
import * as PE from "../admin/people/src/ui.js";
import * as CAL from "../availability/src/calendar.js";
import * as SCH from "../availability/src/schedule.js";
import * as AV from "../availability/src/strings.js";

F.setLang("zh"); SITE.setLang("zh"); AV.setLang("zh");
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

test("★ 側欄四份都有「會議」（幹部都看得到）；誰能排哪些範圍：senior 全部、Director 自己 team、Associate 沒有", () => {
  for (const X of [F, SITE, PA, PE]) { const it = X.ITEMS.find(i => i.key === "meetings"); assert.equal(it.who, "cadre"); assert.ok(X.canSee(it, ME)); }
  assert.deepEqual(F.mtScopes(PRES, ["Marketing Team"]), ["board", "Marketing Team"]);
  assert.deepEqual(F.mtScopes(DIR, []), ["Marketing Team"]);
  assert.deepEqual(F.mtScopes(ME, []), []);
  assert.deepEqual(SCH.scopesFor(true, {}, ["A Team"]), ["board", "A Team"]);
  assert.deepEqual(SCH.scopesFor(false, { "res:Marketing Team": "manage", "res:Curriculum Team": "edit", apps: "manage" }, []), ["Marketing Team"]);
});

test("清單：之後的與過去的分開、每一列人數與會到數、紀錄連結、我的回覆狀態；能排的人才有「記一場會議」", () => {
  const h = F.meetingsListHTML(M, ME, ["Marketing Team"], null, PEOPLE, "", false);
  assert.match(h, /<h2>之後的<span class="hint">1<\/span>/); assert.match(h, /<h2>過去的<span class="hint">1<\/span>/);
  assert.match(h, /data-act="mt-open" data-id="11111111-1111-4111-8111-111111111111">Marketing 週會<\/a>/);
  assert.match(h, /3 人，1 人說會到/); assert.match(h, /href="https:\/\/docs.google.com\/document\/d\/abc"[^>]*>會議紀錄<\/a>/);
  assert.match(h, /<span class="tag">還沒回<\/span>/, "我在名單上、還沒回");
  assert.match(h, /data-act="mt-save" data-id=""/); assert.match(h, /<select id="mt-scope"[^>]*><option value="Marketing Team" selected>Marketing<\/option>/);
  assert.doesNotMatch(F.meetingsListHTML(M, ME, [], null, PEOPLE, "", false), /mt-save/, "不能排的人沒有那張表單");
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

test("看板上排一場會：有空的人預勾、找名字、全勾只勾篩出來的、送出鈕算人數；彈窗只給能排的人那顆按鈕", () => {
  const members = [{ id: "u1", name: "王平", alt: "Paul", board_role: "president", team: "" }, { id: "u2", name: "小安", alt: "Ann", board_role: "member", team: "Curriculum Team" }, { id: "u5", name: "雅婷", alt: "Tina", board_role: "director", team: "Marketing Team, Sponsorship Team" }];
  const ctx = { scopes: ["Marketing Team"], members, free: ["u1", "u2"], when: "星期一 10:00" };
  const h = SCH.scheduleHTML({ ticked: ["u1", "u2"], q: "", title: "BT 會議", minutes: 60 }, ctx, false);
  assert.match(h, /value="u1" data-act="sch-tick" checked><b>王平<\/b><span class="alt">Paul<\/span><span class="rk">CP<\/span><span class="mini free">有空<\/span>/, "一列：名字、英文、職級標、有空");
  assert.match(h, /value="u5" data-act="sch-tick"><b>雅婷<\/b><span class="alt">Tina<\/span><span class="rk">DR<\/span><span class="mini">Marketing<\/span> <span class="mini">Sponsorship<\/span>/, "team 淡字不帶 Team 那個字");
  assert.match(readFileSync("availability/index.html", "utf8"), /\.sch-row\{display:flex;flex-direction:row;align-items:center/, "一列同一行靠左（看板自己的 CSS，不 import admin）");
  assert.match(readFileSync("availability/src/data.js", "utf8"), /select\("id, name_zh, name_en, team, tz, board_role"\)/, "名單帶職級");
  assert.match(h, /data-act="sch-send">排會並寄邀請（2 人）<\/button>/);
  assert.match(h, /<option value="60" selected>60<\/option>/);
  assert.deepEqual(SCH.shown(members, "tina").map(m => m.id), ["u5"]);
  assert.match(SCH.scheduleHTML({ ticked: [], q: "zzz" }, ctx, false), /data-act="sch-send" disabled/);
  const m = readFileSync("availability/src/main.js", "utf8");
  assert.match(m, /DATA\.scheduleMeeting\(/); assert.match(m, /act === "sch-open"/);
  // 2026-10-28：回覆搬到 /home/，看板收到 ?meeting= 就轉過去。
  assert.match(m, /location\.replace\("\.\.\/home\/\?meeting="/); assert.doesNotMatch(m, /act === "rsvp"/);
  assert.match(readFileSync("availability/src/ui.js", "utf8"), /ctx\.canSchedule && !ctx\.schedule \? `<button class="btn ghost" data-act="sch-open">/);
});

test("★ .ics 照 RFC 5545 的基本規矩：CRLF、必要欄位、UTC Z、跳脫、折行不超過 75 個位元組；跟資料庫那一份同一個形狀", () => {
  const ics = CAL.icsText({ uid: "meeting-m1", start: new Date("2027-03-01T02:00:00Z"), end: new Date("2027-03-01T03:00:00Z"), title: "Marketing 週會; 第二季", description: "海報進度, 嘖嘖頁\n分工", url: "https://docs.google.com/document/d/abc", now: new Date("2026-10-24T00:00:00Z") });
  assert.ok(ics.endsWith("\r\n")); assert.ok(!/[^\r]\n/.test(ics), "每一行 CRLF");
  const lines = ics.split("\r\n").filter(Boolean);
  assert.equal(lines[0], "BEGIN:VCALENDAR"); assert.equal(lines[lines.length - 1], "END:VCALENDAR");
  for (const l of ["VERSION:2.0", "PRODID:-//Beyond Taiwan//bt-site//EN", "METHOD:PUBLISH", "BEGIN:VEVENT", "UID:meeting-m1", "DTSTAMP:20261024T000000Z", "DTSTART:20270301T020000Z", "DTEND:20270301T030000Z", "SUMMARY:Marketing 週會\; 第二季", "DESCRIPTION:海報進度\\, 嘖嘖頁\\n分工", "URL:https://docs.google.com/document/d/abc", "END:VEVENT"]) assert.ok(lines.includes(l), "少了 " + l);
  const enc = new TextEncoder();
  for (const l of ics.split("\r\n")) assert.ok(enc.encode(l).length <= 75, "超過 75 位元組：" + l);
  const long = CAL.icsText({ uid: "x", start: new Date(0), end: new Date(3600000), title: "很長的標題".repeat(20) });
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

test("★ 英文畫出來不剩中文（會議清單、一場會議、看板排會）", () => {
  F.setLang("en"); AV.setLang("en");
  const members = [{ id: "u1", name: "Paul", alt: "" }];
  for (const h of [F.meetingsListHTML(M, ME, ["Marketing Team"], null, PEOPLE, "", false), F.meetingHTML(M[0], ME, PEOPLE, true, ["Marketing Team"], null, "", false),
    SCH.scheduleHTML({ ticked: [] }, { scopes: ["board"], members, free: [], when: "Mon 10:00" }, false)]) {
    const text = h.replace(/<[^>]+>/g, " ").replace(/Marketing 週會|Board 月會|海報進度|王平|小安|雅婷/g, "");
    assert.doesNotMatch(text, /[一-鿿]/, "英文模式不該剩中文：" + (text.match(/[^\s]*[一-鿿]+[^\s]*/) || [""])[0]);
  }
  F.setLang("zh"); AV.setLang("zh");
});

test("勾或取消出席的人，人數與送出鈕的數字跟著變（Paul 2026-10-28 回報數字不動）", () => {
  const ctx = { scopes: ["board"], members: [{ id: "u1", name: "王平" }], free: [], when: "w" };
  const h = SCH.scheduleHTML({ ticked: ["u1"] }, ctx, false);
  assert.match(h, /<i id="sch-who-n">/, "人數那一行有 id，change 才改得到");
  assert.match(h, /id="sch-send" data-act="sch-send"/, "送出鈕有 id");
  const m = readFileSync("availability/src/main.js", "utf8");
  const i = m.indexOf('document.addEventListener("change"');
  assert.ok(i > 0, "有 change 監聽");
  const body = m.slice(i, i + 600);
  assert.match(body, /sch-member/); assert.match(body, /readSch\(\)/);
  assert.match(body, /schCount\(\)/);
  const f = m.slice(m.indexOf("function schCount()"), m.indexOf("function schCount()") + 500);
  assert.match(f, /sch-who-n/); assert.match(f, /T\("sch\.send"/); assert.match(f, /btn\.disabled = !n/);
  const all = m.slice(m.indexOf('act === "sch-all" || act === "sch-none"'), m.indexOf('act === "sch-all" || act === "sch-none"') + 700);
  assert.match(all, /x\.checked = on\.has\(x\.value\)/, "全勾／全取消只改勾選框");
  assert.doesNotMatch(all.slice(0, all.indexOf("return;", all.indexOf("schCount()")) ), /render\(\)/, "全勾／全取消不重畫，彈窗不跳回最上面");
});

test("寄信修好：send_pending_mail 的 r 是 mail_outbox 的型別（11-05 那一版用 record，每封信都 cannot cast）", () => {
  const s = readFileSync("supabase/migrations/2026-11-11-fix-mail-send.sql", "utf8");
  assert.match(s, /r public\.mail_outbox%rowtype; v_key text;/);
  assert.doesNotMatch(s, /^\s*r record;/m);
  assert.match(readFileSync("scripts/db/smoke.sh", "utf8"), /2026-11-11-fix-mail-send\.sql/, "smoke 有跑這一支");
});
