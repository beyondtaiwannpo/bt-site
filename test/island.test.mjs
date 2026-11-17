// /island/ BT 島的純函式（2026-11-16）。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as D from "../island/src/data.js";
import * as UI from "../island/src/ui.js";
import * as L from "../island/src/layout.js";
import { STR, t } from "../island/src/strings.js";

const raw = JSON.parse(fs.readFileSync("island/teams.json", "utf8"));
const d = D.normalize(raw);

test("資料：八座島照固定順序、每個至少一樣在做的事、人都對得到島、協作線兩邊都是島", () => {
  assert.deepEqual(d.teams.map(x => x.id), L.TEAM_ORDER);
  for (const tm of d.teams) { assert.ok(tm.programs.length >= 1, tm.id); assert.ok(tm.people.length >= 1 || tm.id === "commons", tm.id); }
  assert.equal(d.people.length, d.teams.reduce((n, tm) => n + tm.people.length, 0));
  assert.equal(d.teams[0].people.length, 0);   // 聚會所沒有人住，大家都會走過來
  assert.equal(d.teams[7].people.length, 12);  // 機場：十位校友加兩位學員
  assert.ok(d.teams[7].sea);
  assert.ok(d.connections.length >= 10);
  assert.ok(D.connectionsOf(d, "curriculum").length >= 3);
  // 校友與學員都有走去的島；也參與別座島的人會走過去
  for (const p of d.teams[7].people) { assert.ok(p.flow && p.goes, p.code); assert.ok(p.sample); }
  assert.ok(D.visitorsOf(d, "curriculum").length >= 2);
  // 兩位 Co-President 住在自己的 team（Sponsorship）
  assert.equal(d.people.find(p => p.code === "paul").team, "sponsorship");
  assert.equal(d.people.find(p => p.code === "alysia").team, "sponsorship");
});

test("資料：未成年只有角色沒有名字；沒有同意（named 不是 true）就不顯示名字；連結只收站內相對路徑與 https", () => {
  for (const p of d.people.filter(x => /minor/.test(x.code))) { assert.equal(p.named, false); assert.equal(p.name_zh, ""); assert.ok(D.label(p, "zh")); }
  const x = D.normalize({ teams: [{ id: "commons", name_zh: "E", programs: [{ id: "a", name_zh: "A", link: "javascript:alert(1)" }, { id: "b", name_zh: "B", link: "../programs/" }] }], people: [{ code: "p1", team: "commons", role: "director", named: true, name_zh: "某人" }, { code: "p2", team: "commons", role: "director", named: false, name_zh: "某人" }] });
  assert.equal(x.teams[0].programs[0].link, "");
  assert.equal(x.teams[0].programs[1].link, "../programs/");
  assert.equal(D.label(x.people[0], "zh"), "某人");
  assert.equal(D.label(x.people[1], "zh"), "director");
});

test("網址：#team、#team/program、#p/code", () => {
  assert.deepEqual(D.parseHash("#curriculum"), { kind: "team", team: "curriculum" });
  assert.deepEqual(D.parseHash("#curriculum/bootcamp"), { kind: "program", team: "curriculum", program: "bootcamp" });
  assert.deepEqual(D.parseHash("#p/cu-dir"), { kind: "person", code: "cu-dir" });
  assert.deepEqual(D.parseHash(""), { kind: "overview" });
  assert.equal(D.hashFor({ kind: "program", team: "cr", program: "school-talks" }), "#cr/school-talks");
});

test("我：只收稱呼、team、上衣、頭髮；稱呼最多 12 字；壞的 team 退回 exec", () => {
  const me = D.normalizeMe({ name: "  一二三四五六七八九十十一十二十三 ", team: "nope", shirt: "9", hair: "-1", extra: "x" }, d.teams);
  assert.deepEqual(me, { name: "一二三四五六七八九十十一", team: "exec", shirt: 5, hair: 0 });
  assert.equal(D.normalizeMe({ name: "   " }, d.teams), null);
  assert.equal(D.normalizeMe("junk", d.teams), null);
});

test("位置：八座島不重疊、橋是六條輻條加六條環加校友那一條、走得到每一座；做的事蓋在島上、人走的點也在島上", () => {
  const isl = L.islands(); assert.equal(isl.length, 8);
  assert.ok(isl[7].sea && isl[7].id === "airport");
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) assert.ok(Math.hypot(isl[i].x - isl[j].x, isl[i].z - isl[j].z) > isl[i].r + isl[j].r + 2, isl[i].id + " " + isl[j].id);
  assert.equal(L.bridges().length, 14);
  assert.equal(L.route("airport", "commons").length, 3);
  assert.deepEqual(L.route("airport", "cr"), ["airport", "cr"]);
  assert.deepEqual(L.route("sponsorship", "mentorship"), ["sponsorship", "commons", "mentorship"]);
  assert.deepEqual(L.route("commons", "commons"), ["commons"]);
  const pts = L.routePoints(L.route("airport", "cr")); assert.equal(pts.length, 4);
  const cu = L.islandOf("curriculum"); const spots = L.programSpots(cu, 3);
  for (const s of spots) assert.ok(Math.hypot(s.x - cu.x, s.z - cu.z) < cu.r - 1.5);
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 30; i++) { const w = L.wanderTarget(cu, spots, rnd); assert.ok(Math.hypot(w.x - cu.x, w.z - cu.z) < cu.r - 1.5); for (const s of spots) assert.ok(Math.hypot(w.x - s.x, w.z - s.z) >= 2.3 || (w.x === cu.x && w.z === cu.z + 2)); }
  assert.ok(L.cameraOverview(false).pos[1] > L.cameraIsland(cu, false).pos[1]);
  assert.ok(L.cameraBird(false).pos[1] > L.cameraOverview(false).pos[1]);
});

test("清單與卡的 HTML：七個 team、做的事可以點、人用角色不用名字、連結逃脫", () => {
  const idx = UI.indexHTML(d, "zh", { team: "mentorship" });
  assert.equal((idx.match(/data-go-team="/g) || []).length, 8);
  assert.ok(idx.includes('class="tree-team on" data-team="mentorship"'));
  const card = UI.teamCardHTML(d.teams[2], "zh", d);
  assert.ok(card.includes("探索營 College Bootcamp"));
  assert.ok((card.match(/data-go-person="/g) || []).length >= 7);
  assert.ok(card.includes("跟誰一起做") && card.includes("常走過來的人"));
  assert.ok(!card.includes("Daphne") && !card.includes("Alice"));
  const en = UI.programCardHTML(d.teams[2].programs[0], d.teams[2], "en");
  assert.ok(en.includes("Twice a year"));
  assert.ok(en.includes('href="../programs/"'));
  const person = UI.personCardHTML(d.people.find(p => p.code === "ann-chen"), d.teams[1], "en", d);
  assert.ok(person.includes("Ann Chen") && person.includes("Also on"));
  const al = UI.personCardHTML(d.teams[7].people[0], d.teams[7], "zh", d);
  assert.ok(al.includes("常走去") && al.includes("遮字的範例"));
  const form = UI.meFormHTML(d, "zh", { name: "<b>", team: "cr", shirt: 1, hair: 2 });
  assert.ok(form.includes('value="&lt;b&gt;"'));
  assert.ok(form.includes('name="shirt" value="1" checked'));
  assert.ok(form.includes("data-me-remove"));
});

test("字典：每一個鍵中英都有；資料裡沒有佔位字", () => {
  for (const k of Object.keys(STR)) { assert.ok(STR[k].zh, k); assert.ok(STR[k].en, k); }
  assert.equal(t("countPeople", "en", { n: 5 }), "5 people");
  assert.ok(!fs.readFileSync("island/teams.json", "utf8").includes("【待補"));
});

test("跟官網接起來：活動照 team 字樣對到島、報名開著才給 /apply/ 連結、過期的不列；校友照 title 走去以前的 team，真校友進來 sample 的就讓位", () => {
  assert.equal(D.teamIdFor("Curriculum Team"), "curriculum");
  assert.equal(D.teamIdFor("Community Relations"), "cr");
  assert.equal(D.teamIdFor("CR"), "cr");
  assert.equal(D.teamIdFor("whatever"), "commons");
  const soon = new Date(Date.now() + 864e5 * 30).toISOString(), gone = new Date(Date.now() - 864e5 * 30).toISOString();
  const evs = D.normalizeEvents([
    { slug: "camp-2027", team: "Curriculum Team", title_zh: "探索營", starts_at: soon, form_id: "f1", signup_open: true, capacity: 80, signed_up: 10 },
    { slug: "old", team: "Curriculum Team", title_zh: "舊的", starts_at: gone, ends_at: gone, form_id: "f0", signup_open: true },
    { slug: "talk", team: "CR", title_zh: "講座", starts_at: soon },
  ]);
  assert.deepEqual(evs.map(e => e.slug), ["camp-2027", "talk"]);
  assert.equal(evs[0].state, "open"); assert.equal(evs[0].link, "../apply/?f=f1");
  assert.equal(evs[1].state, "info"); assert.equal(evs[1].link, "../events/#talk");
  assert.equal(D.eventsOf(evs, "curriculum").length, 1);
  const al = D.alumniToPeople([{ id: "x1", name: "某校友", title: "Director, Curriculum Team · 2025-26", quote: "一句話", city: "Madison", country_en: "USA" }, { id: "x2", name: "另一位", title: "" }, { name: "" }]);
  assert.equal(al.length, 2);
  assert.equal(al[0].team, "airport"); assert.equal(al[0].goes, "curriculum"); assert.equal(al[0].flow.carry_zh, "Director"); assert.equal(al[0].named, true); assert.equal(al[0].where, "Madison, USA");
  assert.equal(al[1].goes, "commons");
  const d2 = D.normalize(JSON.parse(fs.readFileSync("island/teams.json", "utf8")));
  D.mergeAlumni(d2, al);
  const airport = d2.teams.find(tm => tm.id === "airport");
  assert.equal(airport.people.filter(p => p.role === "alumni").length, 2);
  assert.equal(airport.people.filter(p => p.role === "student").length, 2);
  const card = UI.teamCardHTML(d2.teams[2], "zh", { ...d2, events: evs });
  assert.ok(card.includes("報名中") && card.includes('href="../apply/?f=f1"'));
});
