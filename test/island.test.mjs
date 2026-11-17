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

test("資料：七個 team 照固定順序、每個至少一樣在做的事、人都對得到 team", () => {
  assert.deepEqual(d.teams.map(x => x.id), L.TEAM_ORDER);
  for (const tm of d.teams) { assert.ok(tm.programs.length >= 1, tm.id); assert.ok(tm.people.length >= 1, tm.id); }
  assert.equal(d.people.length, d.teams.reduce((n, tm) => n + tm.people.length, 0));
  assert.equal(d.teams[0].people.length, 2);   // 兩位 Co-President
});

test("資料：沒有同意（named 不是 true）就不顯示名字，只顯示角色；連結只收站內相對路徑與 https", () => {
  for (const p of d.people) { assert.equal(p.named, false); assert.equal(p.name_zh, ""); assert.ok(D.label(p, "zh")); }
  const x = D.normalize({ teams: [{ id: "exec", name_zh: "E", programs: [{ id: "a", name_zh: "A", link: "javascript:alert(1)" }, { id: "b", name_zh: "B", link: "../programs/" }] }], people: [{ code: "p1", team: "exec", role: "director", named: true, name_zh: "某人" }, { code: "p2", team: "exec", role: "director", named: false, name_zh: "某人" }] });
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

test("位置：七座島不重疊、六座外圍等距、橋從中間到每一座；做的事蓋在島上、人走的點也在島上", () => {
  const isl = L.islands(); assert.equal(isl.length, 7);
  for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) assert.ok(Math.hypot(isl[i].x - isl[j].x, isl[i].z - isl[j].z) > isl[i].r + isl[j].r + 2);
  assert.equal(L.bridges().length, 6);
  const cu = L.islandOf("curriculum"); const spots = L.programSpots(cu, 3);
  for (const s of spots) assert.ok(Math.hypot(s.x - cu.x, s.z - cu.z) < cu.r - 1.5);
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 30; i++) { const w = L.wanderTarget(cu, spots, rnd); assert.ok(Math.hypot(w.x - cu.x, w.z - cu.z) < cu.r - 1.5); for (const s of spots) assert.ok(Math.hypot(w.x - s.x, w.z - s.z) >= 2.3 || (w.x === cu.x && w.z === cu.z + 2)); }
  assert.ok(L.cameraOverview(false).pos[1] > L.cameraIsland(cu, false).pos[1]);
  assert.ok(L.cameraBird(false).pos[1] > L.cameraOverview(false).pos[1]);
});

test("清單與卡的 HTML：七個 team、做的事可以點、人用角色不用名字、連結逃脫", () => {
  const idx = UI.indexHTML(d, "zh", { team: "mentorship" });
  assert.equal((idx.match(/data-go-team="/g) || []).length, 7);
  assert.ok(idx.includes('class="tree-team on" data-team="mentorship"'));
  const card = UI.teamCardHTML(d.teams[2], "zh");
  assert.ok(card.includes("探索營 College Bootcamp"));
  assert.equal((card.match(/data-go-person="/g) || []).length, 7);
  assert.ok(!card.includes("Ann Lin"));
  const en = UI.programCardHTML(d.teams[2].programs[0], d.teams[2], "en");
  assert.ok(en.includes("Twice a year"));
  assert.ok(en.includes('href="../programs/"'));
  const person = UI.personCardHTML(d.people[0], d.teams[0], "en");
  assert.ok(person.includes("Co-President"));
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
