// 幹部首頁與行事曆（2026-10-28）的純函式。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as UI from "../home/src/ui.js";
import * as NAV from "../shared/nav.js";
UI.setLang("zh");

test("時間照看的人的時區：芝加哥早上十點是台北半夜", () => {
  const t = new Date("2026-11-15T16:00:00Z");
  assert.equal(UI.dayKey(t, "America/Chicago"), "2026-11-15");
  assert.equal(UI.minuteOfDay(t, "America/Chicago"), 10 * 60);
  assert.equal(UI.dayKey(t, "Asia/Taipei"), "2026-11-16");
  assert.equal(UI.minuteOfDay(t, "Asia/Taipei"), 0);
});
test("時區寫錯不會整頁壞掉，退回台北", () => {
  assert.equal(UI.dayKey(new Date("2026-11-15T16:00:00Z"), "Not/AZone"), "2026-11-16");
});
test("月曆：六週 42 格、星期一開頭、跨年", () => {
  const g = UI.monthKeys("2026-11-15");
  assert.equal(g.length, 42);
  assert.equal(g[0].key, "2026-10-26");   // 11/1 是星期日，那一週的星期一是 10/26
  assert.equal(UI.weekdayOfKey(g[0].key), 1);
  assert.equal(g.filter(c => c.inMonth).length, 30);
  assert.equal(UI.shiftMonth("2026-12-05", 1), "2027-01-01");
  assert.equal(UI.shiftMonth("2026-01-31", -1), "2025-12-01");
});
test("週：星期一到星期日，跨月", () => {
  assert.deepEqual(UI.weekKeys("2026-11-01"), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
});

const ME = "u-me", OTHER = "u-o";
const now = new Date("2026-11-10T00:00:00Z");
const mt = (id, start, extra) => Object.assign({ id, title: id, scope: "board", starts_at: start, ends_at: new Date(new Date(start).getTime() + 3600000).toISOString(),
  agenda: "", doc_url: null, created_by: OTHER, required: false, attendees: [], notes: [] }, extra);
const meetings = [
  mt("wait", "2026-11-12T12:00:00Z", { required: true, attendees: [{ user_id: ME, status: "invited" }, { user_id: OTHER, status: "accepted" }] }),
  mt("yes", "2026-11-13T12:00:00Z", { attendees: [{ user_id: ME, status: "accepted" }] }),
  mt("past", "2026-11-01T12:00:00Z", { attendees: [{ user_id: ME, status: "invited" }] }),
  mt("notme", "2026-11-14T12:00:00Z", { attendees: [{ user_id: OTHER, status: "invited" }] }),
  mt("mine", "2026-11-15T12:00:00Z", { created_by: ME, attendees: [{ user_id: OTHER, status: "declined" }], notes: [{ user_id: OTHER, note: "考試" }] }),
];
const events = [{ slug: "game", title_zh: "遊戲夜", title_en: "Game night", starts_at: "2026-11-20T12:00:00Z", ends_at: null }];
const items = UI.itemsOf(meetings, events, ME);

test("等你回覆：只有受邀、還沒回、還沒結束的", () => {
  assert.deepEqual(UI.needsReply(items, now).map(i => i.id), ["wait"]);
});
test("接下來：我會到的、我排的、活動；沒邀我的不在裡面；等回覆的不重複出現", () => {
  assert.deepEqual(UI.upcoming(items, now).map(i => i.id), ["yes", "mine", "ev-game"]);
});
test("行事曆「只看我的」藏掉沒邀我的會；「整個 BT」全部", () => {
  assert.ok(!UI.visibleItems(items, "mine").some(i => i.id === "notme"));
  assert.ok(UI.visibleItems(items, "all").some(i => i.id === "notme"));
});
test("誰會到：排會的人與 senior 看得到，別人看不到；Director 看得到自己 team 的", () => {
  const mine = items.find(i => i.id === "mine"), other = items.find(i => i.id === "wait");
  assert.equal(UI.canSeeReplies(mine, ME, false, {}), true);
  assert.equal(UI.canSeeReplies(other, ME, false, {}), false);
  assert.equal(UI.canSeeReplies(other, ME, true, {}), true);
  const team = Object.assign({}, other, { scope: "Curriculum" });
  assert.equal(UI.canSeeReplies(team, ME, false, { "res:Curriculum": "manage" }), true);
  assert.equal(UI.canSeeReplies(team, ME, false, { "res:Curriculum": "edit" }), false);
});
test("誰會到分三組，不能到的帶理由", () => {
  const g = UI.replyGroups(items.find(i => i.id === "mine"), [{ id: OTHER, name_zh: "小安" }]);
  assert.equal(g.no.length, 1);
  assert.equal(g.no[0].note, "考試");
  assert.equal(g.no[0].name, "小安");
});
test("首頁：必到的會不能到先問理由，不直接送", () => {
  const html = UI.homeHTML(items, { me: ME, tz: "Asia/Taipei", now, name: "王平", people: [], ws: {}, reasonFor: "wait" });
  assert.match(html, /id="reason-wait"/);
  assert.match(html, /data-act="rsvp-send"/);
});
test("首頁：等回覆的會有兩顆大按鈕、標必到", () => {
  const html = UI.homeHTML(items, { me: ME, tz: "Asia/Taipei", now, name: "王平", people: [], ws: {} });
  assert.match(html, /data-act="rsvp" data-st="accepted" data-id="wait"/);
  assert.match(html, /必到/);
});
test("名字與理由一律跳脫，不會變成 HTML", () => {
  const evil = UI.itemsOf([mt("x", "2026-11-15T12:00:00Z", { title: "<img src=x>", created_by: ME, attendees: [{ user_id: OTHER, status: "declined" }], notes: [{ user_id: OTHER, note: "<b>hi</b>" }] })], [], ME);
  const html = UI.itemCardHTML(evil[0], { me: ME, tz: "Asia/Taipei", now, people: [{ id: OTHER, name_zh: "<script>" }], ws: {} }, { full: true });
  assert.ok(!html.includes("<img src=x>") && !html.includes("<b>hi</b>") && !html.includes("<script>"));
});
test(".ics 的分號與逗號有跳脫", () => {
  assert.equal(UI.icsEscape("a;b,c"), "a\\;b\\,c");
});
test("頂欄：幹部看到首頁、行事曆排在最前面", () => {
  assert.deepEqual(NAV.featuresFor("cadre").map(f => f.key).slice(0, 2), ["home", "calendar"]);
  assert.ok(!NAV.featuresFor("student").some(f => f.key === "home"));
});
test("行事曆月與週都畫得出來", () => {
  const c = { me: ME, tz: "Asia/Taipei", now, people: [], ws: {} };
  assert.match(UI.calendarHTML(items, c, { view: "month", at: "2026-11-10", mode: "mine" }), /遊戲夜/);
  assert.match(UI.calendarHTML(items, c, { view: "week", at: "2026-11-12", mode: "mine" }), /class="slot"/);
});

// 2026-11-18：首頁下載的 .ics 跟邀請信附的日曆邀請要同一個 UID，不然先收邀請再下載會在日曆上變成兩筆。
test("首頁下載的 .ics 跟資料庫的日曆邀請同一個 UID", async () => {
  const { readFileSync } = await import("node:fs");
  const ics = UI.icsText({ id: "abc", title: "t", start: new Date(0), end: new Date(3600000) });
  assert.match(ics, /\r\nUID:meeting-abc@beyondtaiwannpo\.com\r\n/);
  const sql = readFileSync(new URL("../supabase/migrations/2026-11-18-calendar-invites.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("'UID:meeting-' || m.id::text || '@beyondtaiwannpo.com'"));
});

// 2026-11-22 Google 日曆：有 Meet 連結就有「加入 Google Meet」；已經在 Google 日曆上就不給「加到日曆」，免得出現兩場。
test("★ Meet 連結與已在 Google 日曆上", () => {
  const base = { id: "m1", title: "遊戲夜", starts_at: "2099-01-01T12:00:00Z", ends_at: "2099-01-01T13:00:00Z", attendees: [] };
  const [it] = UI.itemsOf([{ ...base, meet_url: "https://meet.google.com/abc-defg-hij", gcal_event_id: "e1" }], [], "me");
  const ctx = { tz: "Asia/Taipei", me: "me", senior: false, ws: [] };
  const h = UI.itemCardHTML(it, ctx, { full: true });
  assert.match(h, /class="btn sm meet" href="https:\/\/meet\.google\.com\/abc-defg-hij"/);
  assert.doesNotMatch(h, /calendar\.google\.com\/calendar\/render/);
  assert.doesNotMatch(h, /download="bt-meeting\.ics"/);
  const [old] = UI.itemsOf([{ ...base }], [], "me");
  const h2 = UI.itemCardHTML(old, ctx, { full: true });
  assert.doesNotMatch(h2, /class="btn sm meet"/); assert.match(h2, /download="bt-meeting\.ics"/);
  const [bad] = UI.itemsOf([{ ...base, meet_url: "https://evil.example.com/x" }], [], "me");
  assert.equal(bad.meet_url, "", "只收 meet.google.com 的連結");
});
