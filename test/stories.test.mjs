// /stories/ 嘖嘖 persona 頁的純函式（2026-11-16）。跑法：node --test test/*.test.mjs
// 不開瀏覽器：讀 repo 裡的 script.json 與 people.json，看整理出來的形狀與吐出來的 HTML。
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as D from "../stories/src/data.js";
import * as UI from "../stories/src/ui.js";
import { STR, t } from "../stories/src/strings.js";
import * as I from "../stories/src/island.js";
import * as L from "../stories/src/layout.js";

const rawS = JSON.parse(fs.readFileSync("stories/script.json", "utf8"));
const rawP = JSON.parse(fs.readFileSync("stories/people.json", "utf8"));
const people = D.normalizePeople(rawP);
const script = D.normalizeScript(rawS, people);

test("people：沒有 consent_date 的那一筆不進清單，其餘欄位整齊", () => {
  assert.equal(people.has("p-no-consent"), false);
  assert.equal(people.has("p-speaker"), true);
  assert.equal(people.get("p-speaker").county, "台中");
  assert.equal(D.normalizePeople(null).size, 0);
  assert.equal(D.normalizePeople({ people: [{ code: "x", consent_date: "yesterday" }] }).size, 0);
  // county 填錯就是空字串（島上不畫，但人還在）
  assert.equal(D.normalizePeople({ people: [{ code: "y", county: "新北", consent_date: "2026-01-01" }] }).get("y").county, "");
});

test("script：三個 persona、各八關、每關兩個選擇、關的順序固定", () => {
  assert.equal(script.demo, true);
  assert.deepEqual(script.personas.map(p => p.id), ["a", "b", "c"]);
  for (const p of script.personas) {
    assert.deepEqual(p.scenes.map(s => s.id), D.SCENE_IDS);
    for (const s of p.scenes) assert.equal(s.choices.length, 2);
  }
  assert.equal(script.personas[0].scenes[2].kind, "wall");
  assert.equal(script.personas[0].scenes[3].kind, "map");
  assert.equal(script.personas[0].scenes[7].kind, "letter");
  assert.equal(script.notes.length, 12);
});

test("script：劇本指到沒同意的人，那一關就當作沒有人；少一關的 persona 整個不進清單", () => {
  const raw = JSON.parse(JSON.stringify(rawS));
  raw.personas[0].scenes[1].choices[0].person = "p-no-consent";
  raw.personas[1].scenes.pop();
  const s = D.normalizeScript(raw, people);
  assert.equal(s.personas[0].scenes[1].choices[0].person, null);
  assert.deepEqual(s.personas.map(p => p.id), ["a", "c"]);
});

test("網址：#a #b #c 是哪個學生，別的 hash 不算；?from=zeczec 與 ?shell=", () => {
  assert.equal(D.personaFromHash("#b"), "b");
  assert.equal(D.personaFromHash("#d"), "");
  assert.equal(D.personaFromHash(""), "");
  assert.equal(D.hashFor("c"), "#c");
  assert.equal(D.hashFor("z"), "");
  assert.equal(D.fromZeczec("?from=zeczec&lang=zh"), true);
  assert.equal(D.fromZeczec("?lang=zh"), false);
  assert.equal(D.shellFromSearch("?shell=lamp"), "lamp");
  assert.equal(D.shellFromSearch("?shell=nope"), "island");
  assert.equal(D.shellFromSearch("", "lamp"), "lamp");
});

test("進度：第 i 關選前一半、選後整格；結尾 1", () => {
  assert.equal(D.progressOf(0, false, 8), 0.5 / 8);
  assert.equal(D.progressOf(0, true, 8), 1 / 8);
  assert.equal(D.progressOf(7, true, 8), 1);
  assert.equal(D.progressOf(0, true, 0), 0);
});

test("這一年遇到的人：照順序、不重複、沒選的關不算", () => {
  const a = script.personas[0];
  const met = D.peopleMet(a, [0, 0, 1, 0, 1, 0, 0, 1]);
  assert.deepEqual(met.map(p => p.code), ["p-speaker", "p-curriculum", "p-mentor-us", "p-parent", "p-intern", "p-mentor-tw"]);
  assert.deepEqual(D.peopleMet(a, []), []);
});

test("第一屏 HTML：三張卡、每張一顆按鈕、範例標記在", () => {
  const h = UI.pickerHTML(script, "zh");
  assert.equal((h.match(/data-pick="/g) || []).length, 3);
  assert.ok(h.includes("先看完每個登機門"));
  assert.ok(h.includes(t("demoBadge", "zh")));
  const e = UI.pickerHTML(script, "en");
  assert.ok(e.includes("See every gate first"));
});

test("一關 HTML：選前只有兩顆選擇；選後長出引言、BT 做了什麼、旁邊的人、下一關", () => {
  const a = script.personas[0];
  const before = UI.sceneHTML(a, 1, "zh", null, script.notes);
  assert.equal((before.match(/data-choice="/g) || []).length, 2);
  assert.ok(!before.includes("class=\"reveal\""));
  const after = UI.sceneHTML(a, 1, "zh", 0, script.notes);
  assert.ok(after.includes("class=\"reveal\""));
  assert.ok(after.includes("講者 J（範例）"));
  assert.ok(after.includes("data-next"));
  assert.ok(after.includes(t("next", "zh")));
  // 第一關沒有人（BT 還沒出現）：沒有「在你旁邊的人」那一塊
  const first = UI.sceneHTML(a, 0, "zh", 0, script.notes);
  assert.ok(!first.includes("class=\"who\""));
  // 最後一關的按鈕是「看結尾」，而且有那封信
  const last = UI.sceneHTML(a, 7, "zh", 1, script.notes);
  assert.ok(last.includes(t("toEnd", "zh")));
  assert.ok(last.includes("data-flip"));
  // 便利貼那一關有牆，十二張
  const wall = UI.sceneHTML(a, 2, "zh", null, script.notes);
  assert.equal((wall.match(/class="note-btn"/g) || []).length, 12);
});

test("HTML 逃脫：劇本裡的 < 與 \" 不會變成標籤", () => {
  const raw = JSON.parse(JSON.stringify(rawS));
  raw.personas[0].scenes[0].situation_zh = "<script>x</script> \"q\"";
  const s = D.normalizeScript(raw, people);
  const h = UI.sceneHTML(s.personas[0], 0, "zh", null, []);
  assert.ok(!h.includes("<script>x"));
  assert.ok(h.includes("&lt;script&gt;x"));
});

test("結尾 HTML：0 元那一句、遇到的人、贊助那顆；從嘖嘖來的沒有「看看 BT」那顆", () => {
  const a = script.personas[0], met = D.peopleMet(a, [0, 0, 0, 0, 0, 0, 0, 0]);
  const h = UI.endHTML(a, met, "zh", { zeczec: "https://www.zeczec.com/", fromZeczec: false });
  assert.ok(h.includes(t("endZero", "zh")));
  assert.ok(h.includes("https://www.zeczec.com/"));
  assert.ok(h.includes("class=\"explore\""));
  assert.equal((h.match(/<li>/g) || []).length, met.length);
  const z = UI.endHTML(a, met, "zh", { zeczec: "https://www.zeczec.com/", fromZeczec: true });
  assert.ok(!z.includes("class=\"explore\""));
  assert.ok(z.includes("data-again"));
});

test("字典：每一個鍵中英都有；劇本裡沒有「待補」佔位字", () => {
  for (const k of Object.keys(STR)) { assert.ok(STR[k].zh, k); assert.ok(STR[k].en, k); }
  assert.equal(t("sceneOf", "en", { n: 3, total: 8 }), "Scene 3 of 8");
  assert.equal(t("nope", "zh"), "nope");
  const txt = fs.readFileSync("stories/script.json", "utf8") + fs.readFileSync("stories/people.json", "utf8");
  assert.ok(!txt.includes("【待補"));
});

test("島：八條路徑跟 scripts/taiwan/coastline.txt 一模一樣；16 個縣市座標都在", () => {
  const lines = fs.readFileSync("scripts/taiwan/coastline.txt", "utf8").split("\n").filter(l => /^M[0-9]/.test(l));
  assert.equal(lines.length, 8);
  assert.deepEqual(I.ISLAND, lines);
  assert.equal(Object.keys(I.CITIES).length, 16);
  assert.deepEqual(Object.keys(I.CITIES).sort(), [...D.COUNTIES].sort());
});

test("點燈版的位置：島上的人在縣市座標，海外的人照國家分散在島外、不重疊", () => {
  const tw = L.lampSpot({ county: "台北", country_en: "Taiwan" }, 0);
  assert.deepEqual([tw.x, tw.y], I.CITIES["台北"]);
  assert.equal(tw.abroad, false);
  const us1 = L.lampSpot({ county: "新竹", country_en: "USA" }, 0), us2 = L.lampSpot({ county: "高雄", country_en: "USA" }, 1);
  assert.equal(us1.abroad, true);
  assert.ok(Math.hypot(us1.x - us2.x, us1.y - us2.y) > 40);
  assert.ok(us1.x > 600);                         // 美國在島的右邊
  assert.ok(L.lampSpot({ county: "台北", country_en: "UK" }, 0).x < 300);   // 歐洲在左邊
  // 不認得的國家也有位置
  const q = L.lampSpot({ county: "台北", country_en: "Mars" }, 0); assert.ok(q.abroad && isFinite(q.x));
});

test("島版的位置：八個地方沿環島的路排一圈、不重疊、都在島上；三個學生站在碼頭旁的沙灘上", () => {
  assert.equal(L.STATIONS.length, 8);
  assert.deepEqual(L.STATIONS.map(s => s.kind), ["school", "hall", "camp", "phone", "desk", "home", "post", "pier"]);
  for (const s of L.STATIONS) assert.ok(Math.hypot(s.x, s.z) < L.ISLAND_R - 1.5 && Math.hypot(s.x, s.z) > L.ROAD_R);
  for (let i = 1; i < 8; i++) assert.ok(Math.hypot(L.STATIONS[i].x - L.STATIONS[i - 1].x, L.STATIONS[i].z - L.STATIONS[i - 1].z) > 8);
  assert.equal(L.CANDIDATE_SPOTS.length, 3);
  for (const c of L.CANDIDATE_SPOTS) assert.ok(Math.hypot(c.x, c.z) < L.ISLAND_R && Math.hypot(c.x, c.z) > L.ROAD_R);
  assert.ok(Math.abs(L.CANDIDATE_SPOTS[0].x - L.CANDIDATE_SPOTS[2].x) > 4);
});
