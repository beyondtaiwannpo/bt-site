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

test("位置：八座島不重疊、大小距離形狀各不一樣、橋有長有短、走得到每一座；做的事蓋在島上、人走的點也在島上", () => {
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
  // 每座島不一樣（Paul 2026-11-17）：大小、距離、形狀至少各有兩種以上；橋的長度有長有短；島的範圍要進得了全景的 fit
  const ring = isl.slice(1, 7);
  assert.ok(new Set(ring.map(i => i.r)).size >= 4, "島的大小太像");
  assert.ok(new Set(ring.map(i => Math.round(Math.hypot(i.x, i.z)))).size >= 4, "島離中心的距離太像");
  assert.ok(new Set(isl.map(i => i.shape)).size >= 4, "形狀太像（要有 hex round rect sea）");
  const lens = L.bridges().map(b => Math.hypot(b.x1 - b.x0, b.z1 - b.z0));
  assert.ok(Math.min(...lens) >= 4 && Math.max(...lens) <= 20, "橋太短走不了或太長");
  assert.ok(Math.max(...lens) - Math.min(...lens) >= 5, "橋的長度太像");
  const fit = L.cameraOverview(false).fit;
  assert.ok(Math.max(...isl.map(i => Math.abs(i.x) + i.r)) <= fit[0] + 2 && Math.max(...isl.map(i => Math.abs(i.z) + i.r)) <= fit[1] + 2, "島跑出全景");
  for (const id of Object.keys(L.SPEC)) assert.ok(L.islandOf(id), id);
});

test("Marketing 的貼文牆：只收 instagram.com 的 https 連結、最多 12 則、卡上列出來；instagram.json 本身合法而且不放未成年的名字", () => {
  const raw = JSON.parse(fs.readFileSync("island/instagram.json", "utf8"));
  const ig = D.normalizePosts(raw);
  assert.equal(ig.handle, "beyondtaiwan"); assert.ok(ig.posts.length >= 3);
  for (const x of ig.posts) { assert.match(x.url, /^https:\/\/www\.instagram\.com\//); assert.ok(x.caption_zh && x.caption_en && x.date); assert.ok(["post", "reel"].includes(x.kind)); }
  const bad = D.normalizePosts({ handle: "@x", profile: "http://evil/", posts: [{ url: "javascript:alert(1)" }, { url: "https://www.instagram.com/p/abc/", caption_zh: "好" }, ...Array(20).fill({ url: "https://www.instagram.com/p/z/" })] });
  assert.equal(bad.handle, "x"); assert.equal(bad.profile, ""); assert.equal(bad.posts.length, 12); assert.equal(bad.posts[0].caption_en, "好");
  assert.deepEqual(D.normalizePosts(null), { handle: "", profile: "", posts: [] });
  const mk = d.teams.find(tm => tm.id === "marketing"), prog = mk.programs.find(p => p.id === "instagram");
  assert.equal(prog.kind, "studio");
  const card = UI.programCardHTML(prog, mk, "zh", { ...d, instagram: ig });
  assert.ok(card.includes("最近的貼文") && card.includes('href="https://www.instagram.com/beyondtaiwan/reel/') && card.includes('rel="noopener"'));
  assert.ok(!UI.programCardHTML(prog, mk, "zh", { ...d, instagram: null }).includes("最近的貼文"));
  assert.ok(!UI.programCardHTML(mk.programs.find(p => p.id === "site"), mk, "zh", { ...d, instagram: ig }).includes("最近的貼文"));
  // 未成年兩位的名字不在貼文說明裡（teams.json 裡 named 是 false 的人連名字都沒有，所以這裡守的是說明不提 minor 這個字以外的真名：由人工確認，這裡只守格式）
  for (const x of ig.posts) assert.ok(x.caption_zh.length <= 120, "說明太長，一句話就好");
  // 新的 kind 都在 KINDS 裡
  for (const k of ["school", "studio", "stage"]) assert.ok(D.KINDS.includes(k));
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
  // 「在 BT 做過什麼」（2026-12-28-alumni-bt-role.sql）：填了 team 照 team，沒填 team 照角色給預設，角色也沒填才看職位字樣
  assert.equal(D.alumniTeamFor({ bt_role: "speaker" }), "curriculum");
  assert.equal(D.alumniTeamFor({ bt_role: "mentor" }), "mentorship");
  assert.equal(D.alumniTeamFor({ bt_role: "intern" }), "internship");
  assert.equal(D.alumniTeamFor({ bt_role: "ambassador" }), "cr");
  assert.equal(D.alumniTeamFor({ bt_role: "student" }), "mentorship");
  assert.equal(D.alumniTeamFor({ bt_role: "speaker", bt_team: "Marketing Team" }), "marketing");
  assert.equal(D.alumniTeamFor({ bt_role: "cadre", title: "Director, Internship Team · 2024-25" }), "internship");
  assert.equal(D.alumniTeamFor({ bt_role: "cadre" }), "commons");
  assert.equal(D.alumniTeamFor({ bt_role: "nonsense", title: "" }), "commons");
  const sp = D.alumniToPeople([{ id: "x3", name: "講者", bt_role: "speaker", bt_team: "Community Relations Team", quote: "q" }])[0];
  assert.equal(sp.goes, "cr"); assert.equal(sp.flow.carry_zh, "講者"); assert.equal(sp.flow.carry_en, "Speaker");
  assert.ok(sp.flow.why_zh.includes("講者") && sp.flow.why_zh.includes("Community Relations Team"));
  const d2 = D.normalize(JSON.parse(fs.readFileSync("island/teams.json", "utf8")));
  D.mergeAlumni(d2, al);
  const airport = d2.teams.find(tm => tm.id === "airport");
  assert.equal(airport.people.filter(p => p.role === "alumni").length, 2);
  assert.equal(airport.people.filter(p => p.role === "student").length, 2);
  const card = UI.teamCardHTML(d2.teams[2], "zh", { ...d2, events: evs });
  assert.ok(card.includes("報名中") && card.includes('href="../apply/?f=f1"'));
});
