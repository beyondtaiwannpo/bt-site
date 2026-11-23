// /island/ BT 島的純函式（2026-11-16）。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as D from "../island/src/data.js";
import * as UI from "../island/src/ui.js";
import * as L from "../island/src/layout.js";
import { STR, t } from "../island/src/strings.js";
import * as SITE from "../admin/site/src/ui.js";
import { loadIslandPrograms } from "../admin/site/src/data.js";

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
  // 2026-11-17 起幹部不在 teams.json 裡（島讀團隊頁那一份名單）：檔裡只剩只放角色的範例
  for (const p of d.people) assert.ok(p.sample || p.role === "alumni" || p.role === "student", p.code + " 不該在 teams.json 裡，幹部從 public_team() 來");
  assert.ok(!d.people.some(p => p.named && !["alumni", "student"].includes(p.role)), "teams.json 裡不該有具名的幹部");
});

test("島上的人就是團隊頁那一份名單：public_team() 一筆職位一列拆成人、team 字樣對到島、職位拆成角色、兼兩個 team 的人會走過去、名字只用英文、帶大頭照；進來之後自己打的幹部讓位；頭銜是「Curriculum Director」這種", () => {
  const rows = [
    { id: "11111111-aaaa", name_zh: "王小明", name_en: "Ming Wang", team: "Curriculum Team", avatar: "data:image/jpeg;base64,xx", title_zh: "Director, Curriculum Team", title_en: "Director, Curriculum Team", term: "2026-27" },
    { id: "11111111-aaaa", name_zh: "王小明", name_en: "Ming Wang", team: "Internship Team", avatar: "data:image/jpeg;base64,xx", title_en: "Adviser, Internship Team", term: "2026-27" },
    { id: "22222222-bbbb", name_zh: "李", name_en: "", team: "Sponsorship Team", avatar: "", title_en: "Co-President", term: "2026-27" },
    { id: "22222222-bbbb", name_zh: "李", name_en: "", team: "Sponsorship Team", avatar: "", title_en: "Associate, Sponsorship Team", term: "2026-27" },
    { id: "33333333-cccc", name_zh: "陳", name_en: "Chen", team: "Community Relations Team", avatar: "javascript:x", title_en: "Senior Adviser", term: "2026-27" },
    { id: "44444444-dddd", name_zh: "沒有島", name_en: "Nowhere", team: "Finance Team", title_en: "Associate" },
    { id: "", name_en: "No id", team: "Curriculum Team", title_en: "Associate" },
  ];
  const ppl = D.rosterToPeople(rows, d.teams);
  assert.equal(ppl.length, 3, "對不到島的、沒有 id 的不進來");
  const ming = ppl.find(p => p.name_en === "Ming Wang");
  assert.equal(ming.team, "curriculum"); assert.equal(ming.role, "director"); assert.equal(ming.named, true); assert.equal(ming.db, true);
  assert.equal(ming.name_zh, "Ming Wang", "對外只用英文名");
  assert.deepEqual(ming.also.map(a => a.team), ["internship"]); assert.equal(ming.goes, "internship");
  assert.equal(ming.avatar, "data:image/jpeg;base64,xx");
  const li = ppl.find(p => p.name_en === "李");
  assert.equal(li.role, "copresident", "Co-President 那一列優先"); assert.equal(li.team, "sponsorship"); assert.equal(li.also.length, 0);
  const chen = ppl.find(p => p.name_en === "Chen"); assert.equal(chen.avatar, "", "不是 data: 或 https 的頭像不收"); assert.equal(chen.role, "advisor");
  // 頭銜
  const cu = d.teams.find(tm => tm.id === "curriculum"), sp = d.teams.find(tm => tm.id === "sponsorship"), cr = d.teams.find(tm => tm.id === "cr");
  assert.equal(D.titleFor(ming, cu, "en"), "Curriculum Director");
  assert.equal(D.titleFor(li, sp, "en"), "Co-President");
  assert.equal(D.titleFor(chen, cr, "en"), "Senior Adviser");
  assert.equal(D.titleFor({ role: "associate", title_zh: "Associate", title_en: "Associate" }, cu, "zh"), "Curriculum Associate");
  // 進來之後：sample 的留著，幹部換成真的
  const d2 = D.normalize(JSON.parse(fs.readFileSync("island/teams.json", "utf8")));
  const before = d2.people.length;
  D.mergeRoster(d2, ppl);
  assert.equal(d2.people.length, before + 3);
  assert.ok(d2.teams.find(tm => tm.id === "curriculum").people.some(p => p.code === ming.code));
  assert.ok(d2.people.filter(p => p.sample).length >= 20, "範例的人還在");
  assert.deepEqual(D.mergeRoster(d2, []), d2, "名單空的就什麼都不動");
  // 卡：有照片、頭銜短
  const card = UI.personCardHTML(ming, cu, "en", d2);
  assert.ok(card.includes('class="card-face"') && card.includes("Curriculum Director") && card.includes("Ming Wang") && card.includes("Also on"));
  assert.ok(!card.includes("runs this team"));
  const idx = UI.indexHTML(d2, "en", {});
  assert.ok(idx.includes('data-team="curriculum"'));
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
  // 島排成蜂巢（Paul 2026-11-17 第二次：要像 HEART 那樣島跟島只隔一條水道）：大小至少四種、水道 2 到 7 公尺、橋 3 到 13 公尺；島的範圍要進得了全景的 fit
  const ring = isl.slice(1, 7);
  assert.ok(new Set(ring.map(i => i.r)).size >= 4, "島的大小太像");
  assert.ok(new Set(isl.map(i => i.shape)).size >= 3, "形狀要有 hex round sea");
  for (const b of L.bridges()) { const A = L.islandOf(b.a), B = L.islandOf(b.b); const gap = Math.hypot(A.x - B.x, A.z - B.z) - A.r - B.r; assert.ok(gap >= 2 && gap <= 10, b.a + "-" + b.b + " 水道 " + gap.toFixed(1)); }
  const lens = L.bridges().map(b => Math.hypot(b.x1 - b.x0, b.z1 - b.z0));
  assert.ok(Math.min(...lens) >= 3 && Math.max(...lens) <= 13, "橋太短走不了或太長");
  const fit = L.cameraOverview(false).fit;
  assert.ok(Math.max(...isl.map(i => Math.abs(i.x) + i.r)) <= fit[0] + 2 && Math.max(...isl.map(i => Math.abs(i.z) + i.r)) <= fit[1] + 2, "島跑出全景");
  for (const id of Object.keys(L.SPEC)) assert.ok(L.islandOf(id), id);
  // 走路繞開東西（Paul 2026-11-17：「people are walking inside the building」）：路上每一段都不穿過任何一個圓；目標在圓裡的那一個不算
  const bl = [{ x: 5, z: 0, r: 3 }, { x: 12, z: 1, r: 1.2 }];
  const dp = L.detour({ x: 0, z: 0 }, { x: 16, z: 0 }, bl);
  assert.deepEqual(dp[dp.length - 1], { x: 16, z: 0 });
  let prev = { x: 0, z: 0 };
  for (const q of dp) { for (const b of bl) { for (let k = 0; k <= 20; k++) { const x = prev.x + (q.x - prev.x) * k / 20, z = prev.z + (q.z - prev.z) * k / 20; assert.ok(Math.hypot(x - b.x, z - b.z) >= b.r - 0.01, "穿過了 " + JSON.stringify(b)); } } prev = q; }
  assert.deepEqual(L.detour({ x: 0, z: 0 }, { x: 16, z: 0 }, []), [{ x: 16, z: 0 }]);
  let seed2 = 7; const rnd2 = () => (seed2 = (seed2 * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 30; i++) { const w = L.wanderTarget(cu, [{ x: cu.x, z: cu.z, r: 4 }], rnd2); assert.ok(Math.hypot(w.x - cu.x, w.z - cu.z) >= 4.6 || (w.x === cu.x && w.z === cu.z + 2)); }
});

test("海上的第二批（2026-11-18）：四艘帆船的橢圓、海豚的位置，離每座島、每座小島、機場平台、渡輪航線都 2 公尺以上", () => {
  const isl = L.islands().map(i => ({ id: i.id, x: i.x, z: i.z, r: i.sea ? 13 : i.r })).concat(L.ISLETS.map(i => ({ id: i.id, x: i.x, z: i.z, r: i.r })));
  const farEnough = (x, z, what) => { for (const o of isl) assert.ok(Math.hypot(x - o.x, z - o.z) >= o.r + 2, what + " 離 " + o.id + " 太近"); assert.ok(Math.abs(z - L.FERRY.a[1]) >= 2.5 || x < Math.min(L.FERRY.a[0], L.FERRY.b[0]) - 4 || x > Math.max(L.FERRY.a[0], L.FERRY.b[0]) + 4, what + " 撞到渡輪航線"); };
  assert.equal(L.SAIL_LOOPS.length, 4);
  L.SAIL_LOOPS.forEach((o, k) => { for (let i = 0; i < 72; i++) { const th = i / 72 * L.TAU; farEnough(o.cx + Math.cos(th) * o.rx, o.cz + Math.sin(th) * o.rz, "帆船 " + k); } });
  for (let i = 0; i < 12; i++) { const a = i / 12 * L.TAU; farEnough(L.DOLPHINS.x + Math.cos(a) * 5.5, L.DOLPHINS.z + Math.sin(a) * 5.5, "海豚"); }
});
test("第三批（2026-11-18）：鯨魚的活動範圍離每座島與小島 2 公尺以上而且在全景裡；滑翔翼繞的是雲霄飛車小島；行李拖車的車道在跑道與人走的那一條之間、不碰觀景塔", () => {
  const isl = L.islands().map(i => ({ id: i.id, x: i.x, z: i.z, r: i.sea ? 13 : i.r })).concat(L.ISLETS.map(i => ({ id: i.id, x: i.x, z: i.z, r: i.r })));
  for (let i = 0; i < 12; i++) { const a = i / 12 * L.TAU; const x = L.WHALE.x + Math.cos(a) * 7, z = L.WHALE.z + Math.sin(a) * 7; for (const o of isl) assert.ok(Math.hypot(x - o.x, z - o.z) >= o.r + 2, "鯨魚離 " + o.id + " 太近"); }
  assert.ok(L.WHALE.period >= 30 && L.WHALE.period <= 40, "鯨魚每 30 到 40 秒浮一次");
  const fit = L.cameraOverview(false).fit; assert.ok(Math.abs(L.WHALE.x) <= fit[0] && Math.abs(L.WHALE.z) <= fit[1] + 10, "鯨魚跑出全景");
  const co = L.ISLETS.find(i => i.kind === "coaster"); assert.equal(L.GLIDER.x, co.x); assert.equal(L.GLIDER.z, co.z); assert.ok(L.GLIDER.h >= 12 && L.GLIDER.r >= co.r, "滑翔翼要在雲霄飛車上空繞");
  const air = L.islandOf("airport"); const C = L.CART_LOOP;
  assert.ok(C.z0 > 2.0 && C.z1 < 4.4, "車道要在跑道（z 2.0 以內）與人走的那一條（z 4.4 起）之間");
  assert.ok(C.x0 >= -air.r * 1.3 + 1 && C.x1 <= 9.0, "車道兩頭要在平台上、東邊留給觀景塔");
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) { const w = L.wanderTarget(air, [], rnd); assert.ok(w.z - air.z >= 4.4 - 0.01, "人不走到車道上"); }
});
test("貼文：掛在哪一樣在做的事底下、只收 instagram.com 的 https 連結、最多 12 則、卡上是按鈕先放大再到 Instagram；posts.json 本身合法而且不放未成年的名字", () => {
  const raw = JSON.parse(fs.readFileSync("island/posts.json", "utf8"));
  const ig = D.normalizePosts(raw, d.teams);
  assert.equal(ig.handle, "beyondtaiwan"); assert.ok(ig.posts.length >= 3);
  assert.equal(ig.posts.length, raw.posts.length, "有一則的 program 對不到 teams.json 裡在做的事");
  for (const x of ig.posts) { assert.match(x.url, /^https:\/\/www\.instagram\.com\//); assert.ok(x.caption_zh && x.caption_en && x.date); assert.ok(["post", "reel"].includes(x.kind)); assert.ok(x.program); }
  assert.ok(D.postsOf(ig, "database").length >= 2, "海外大學資料庫那一棟要有大學介紹的貼文");
  assert.equal(D.normalizePosts({ posts: [{ url: "https://www.instagram.com/p/a/", program: "nope" }] }, d.teams).posts.length, 0);
  // 放大看那一張：圖與那顆按鈕都連到 Instagram
  const big = UI.postBigHTML(ig.posts[0], "zh");
  assert.ok(big.includes('class="lb-pic" href="https://www.instagram.com/') && big.includes("到 Instagram 看這一則") && big.includes("data-lb-close"));
  const bad = D.normalizePosts({ handle: "@x", profile: "http://evil/", posts: [{ url: "javascript:alert(1)" }, { url: "https://www.instagram.com/p/abc/", caption_zh: "好" }, ...Array(20).fill({ url: "https://www.instagram.com/p/z/" })] });
  assert.equal(bad.handle, "x"); assert.equal(bad.profile, ""); assert.equal(bad.posts.length, 12); assert.equal(bad.posts[0].caption_en, "好");
  assert.deepEqual(D.normalizePosts(null), { handle: "", profile: "", posts: [] });
  const mk = d.teams.find(tm => tm.id === "marketing"), prog = mk.programs.find(p => p.id === "instagram");
  assert.equal(prog.kind, "studio");
  const card = UI.programCardHTML(prog, mk, "zh", { ...d, instagram: ig });
  assert.ok(card.includes("最近的貼文") && card.includes('data-post="') && !card.includes('class="ig has-img" href='), "卡上的一則要是按鈕，不是直接連出去");
  assert.ok(!UI.programCardHTML(prog, mk, "zh", { ...d, instagram: null }).includes("最近的貼文"));
  assert.ok(!UI.programCardHTML(mk.programs.find(p => p.id === "site"), mk, "zh", { ...d, instagram: ig }).includes("最近的貼文"));
  const cu = d.teams.find(tm => tm.id === "curriculum");
  assert.ok(UI.programCardHTML(cu.programs.find(p => p.id === "database"), cu, "zh", { ...d, instagram: ig }).includes("東京大學"), "大學資料庫那一棟的卡要列出東京大學那一則");
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
  assert.ok((card.match(/data-go-person="/g) || []).length >= 4);
  assert.ok(card.includes("跟誰一起做") && card.includes("常走過來的人"));
  assert.ok(!card.includes("Daphne") && !card.includes("Alice"));
  const en = UI.programCardHTML(d.teams[2].programs[0], d.teams[2], "en");
  assert.ok(en.includes("Twice a year"));
  assert.ok(en.includes('href="../year/"'));
  const person = UI.personCardHTML(d.people.find(p => p.code === "cu-stu-1"), d.teams[2], "zh", d);
  assert.ok(person.includes("探索營學員") && person.includes("學員"));
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

// 後台「BT 島的貼文」（2026-11-17）：誰貼得了哪座島、清單照哪一棟分段、一則的表單、圖沒勾同意不給「放上去」。
test("後台 BT 島的貼文：team 是「改」才貼得了自己那座島、聚會所只有 Marketing 管與 senior、清單與表單畫得出來、有圖沒同意不給放上去", async () => {
  SITE.setLang("zh");
  // teams.json 每個 team 有 workspace，後台用它決定誰貼得了
  for (const tm of d.teams) assert.ok(typeof tm.workspace === "string", tm.id);
  assert.equal(d.teams.find(tm => tm.id === "curriculum").workspace, "Curriculum Team");
  assert.equal(d.teams.find(tm => tm.id === "commons").workspace, "");
  const programs = d.teams.flatMap(tm => tm.programs.map(p => ({ id: p.id, teamId: tm.id, team: tm.workspace, island_zh: tm.name_zh, island_en: tm.name_en, name_zh: p.name_zh, name_en: p.name_en })));
  const edit = { role: "cadre", board: "member", ws: { "res:Curriculum Team": "edit" } };
  const view = { role: "cadre", board: "member", ws: { "res:Curriculum Team": "view" } };
  const mk = { role: "cadre", board: "member", ws: { "res:Marketing Team": "manage" } };
  const pres = { role: "cadre", board: "president", ws: {} };
  assert.equal(SITE.ipCanEdit(edit, "Curriculum Team"), true);
  assert.equal(SITE.ipCanEdit(edit, "Mentorship Team"), false);
  assert.equal(SITE.ipCanEdit(view, "Curriculum Team"), false);
  assert.equal(SITE.ipCanEdit(edit, ""), false, "聚會所：team 的人貼不了");
  assert.equal(SITE.ipCanEdit(mk, ""), true); assert.equal(SITE.ipCanEdit(pres, ""), true);
  assert.equal(SITE.ipCanEditAny(view, programs), false); assert.equal(SITE.ipCanEditAny(edit, programs), true);
  const rows = [
    { id: "a1", program: "database", team: "Curriculum Team", url: "https://www.instagram.com/p/x/", kind: "post", caption_zh: "東大", caption_en: "Tokyo", posted_on: "2026-11-12", image_url: "https://x.supabase.co/storage/v1/object/public/island/a1/1.jpg", consent: false, status: "draft" },
    { id: "a2", program: "instagram", team: "Marketing Team", url: "https://www.instagram.com/reel/y/", kind: "reel", caption_zh: "", caption_en: "Vlog", posted_on: "", image_url: "", consent: false, status: "published" },
  ];
  const list = SITE.islandListHTML(rows, edit, "", false, programs);
  assert.ok(list.includes("Curriculum · 海外大學資料庫") && list.includes("Marketing · Instagram") && list.includes("東大") && list.includes("Vlog") && list.includes('data-act="ip-new"'));
  assert.ok(list.includes("有圖但還沒勾同意"), "清單上要提醒圖還沒勾同意");
  assert.ok(!SITE.islandListHTML(rows, view, "", false, programs).includes('data-act="ip-new"'), "只能看的人沒有「貼一則」");
  assert.ok(SITE.islandListHTML([], edit, "", false, programs).includes("還沒有任何一則"));
  const form = SITE.islandEditHTML(rows[0], edit, "", false, programs, null);
  assert.ok(form.includes('data-autosave="ip-save"') && form.includes('value="database" data-team="Curriculum Team" selected') && form.includes('data-act="ip-publish"'));
  assert.ok(/data-act="ip-publish"[^>]*disabled/.test(form), "有圖沒勾同意，「放上去」要是灰的");
  assert.ok(form.includes('data-act="ip-consent"') && form.includes('id="ip-file"'));
  const ok = SITE.islandEditHTML({ ...rows[0], consent: true }, edit, "", false, programs, null);
  assert.ok(!/data-act="ip-publish"[^>]*disabled/.test(ok));
  const fresh = SITE.islandEditHTML(null, edit, "", false, programs, null);
  assert.ok(fresh.includes('data-act="ip-save"') && !fresh.includes('id="ip-file"') && fresh.includes("先存一次"));
  assert.ok(!fresh.includes('value="mentoring"'), "新的一則只列他貼得了的那幾棟");
  assert.ok(SITE.islandEditHTML(null, pres, "", false, programs, null).includes('value="mentoring"'));
  const ro = SITE.islandEditHTML(rows[0], view, "", false, programs, null);
  assert.ok(!ro.includes("data-autosave") && !ro.includes('data-act="ip-publish"'));
  assert.equal(typeof loadIslandPrograms, "function");
});

// 島、在做的事、協作線搬進資料庫（2026-11-17 第七次）：島先讀 public_island()，八座都在才用；後台的清單與一座島的表單畫得出來，權限跟貼文同一條。
test("島的地圖：資料庫回八座島就用它（範例人仍從 teams.json 來），不齊就退回檔案；後台 BT 島的清單與表單", () => {
  const file = JSON.parse(fs.readFileSync("island/teams.json", "utf8"));
  const dbTeams = file.teams.map(t => ({ ...t, tagline_zh: "後台改過的" }));
  const merged = D.mergeMap(file, { teams: dbTeams, connections: [{ a: "curriculum", b: "internship", why_zh: "x" }] });
  assert.equal(merged.fromDb, true); assert.equal(merged.teams[0].tagline_zh, "後台改過的"); assert.equal(merged.connections.length, 1); assert.equal(merged.people, file.people);
  assert.equal(D.mergeMap(file, { teams: dbTeams.slice(0, 7) }), file, "少一座島就退回檔案");
  assert.equal(D.mergeMap(file, null), file); assert.equal(D.mergeMap(file, { teams: [] }), file);
  const nd = D.normalize(merged); assert.equal(nd.teams.length, 8); assert.equal(nd.connections.length, 1);
  SITE.setLang("zh");
  const map = { teams: file.teams.map(t => ({ id: t.id, name_zh: t.name_zh, name_en: t.name_en, tagline_zh: t.tagline_zh, tagline_en: t.tagline_en, about_zh: t.about_zh, about_en: t.about_en, colour: t.colour, lead: t.lead || "", sea: !!t.sea, ground: t.ground, scenery: t.scenery, trees: t.trees, workspace: t.workspace })),
    programs: file.teams.flatMap(t => t.programs.map((p, i) => ({ ...p, team_id: t.id, sort: (i + 1) * 10 }))), connections: file.connections.map((c, i) => ({ ...c, id: "c" + i })) };
  const edit = { role: "cadre", board: "member", ws: { "res:Curriculum Team": "edit" } };
  const pres = { role: "cadre", board: "president", ws: {} };
  const list = SITE.islandMapListHTML(map, edit, "", false);
  assert.ok(list.includes('data-act="im-open" data-id="curriculum"') && list.includes("協作線") && !list.includes('data-act="im-conn-add"'), "team 的人看得到清單，加不了協作線");
  assert.ok(SITE.islandMapListHTML(map, pres, "", false).includes('data-act="im-conn-add"'));
  const cu = map.teams.find(t => t.id === "curriculum");
  const form = SITE.islandTeamEditHTML(cu, map.programs.filter(p => p.team_id === "curriculum"), edit, "", false);
  assert.ok(form.includes('data-autosave="im-team-save" data-id="curriculum"') && form.includes('data-autosave="im-prog-save" data-id="bootcamp"') && form.includes('data-act="im-prog-add"'));
  assert.ok(form.includes('<option value="tiles" selected>') && form.includes('<option value="classroom" selected>'));
  const me = map.teams.find(t => t.id === "mentorship");
  const ro = SITE.islandTeamEditHTML(me, map.programs.filter(p => p.team_id === "mentorship"), edit, "", false);
  assert.ok(!ro.includes("data-autosave") && !ro.includes('data-act="im-prog-add"') && ro.includes("改不動"), "別座島只能看");
  const one = SITE.islandTeamEditHTML(map.teams.find(t => t.id === "internship"), map.programs.filter(p => p.team_id === "internship"), pres, "", false);
  assert.ok(/data-act="im-prog-del"[^>]*disabled/.test(one), "一座島最後一棟的「拆掉」是灰的");
});
