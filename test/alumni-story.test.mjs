// 「我的故事」（2026-09-11）。幹部與校友填，Co-President 核可，出現在 /alumni/ 上。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTIES, storyMissing, storyStatus, storyHTML, settingsHTML } from "../settings/src/ui.js";

const FULL = {
  display_name: "張 O 睿", school: "高雄中學", county: "高雄", city: "Vancouver",
  country: "加拿大", place: "UBC", quote: "現在換我回去講。", note: "第一次接觸 BT 是在高雄的一場講座。",
  public_story: false, story_approved: false,
};

// 縣市填錯的後果特別安靜：那個人只會不出現在圖上，沒有任何錯誤訊息。
// 所以選單的 16 個必須跟島上的點完全一樣。
test("★ 縣市清單跟 scripts/taiwan/cities.json 完全一致", () => {
  const cities = JSON.parse(readFileSync(new URL("../scripts/taiwan/cities.json", import.meta.url), "utf8"));
  assert.deepEqual([...COUNTIES].sort(), Object.keys(cities).sort());
});

test("必填缺了會被指出來，而且講的是人看得懂的名字", () => {
  assert.deepEqual(storyMissing(FULL), []);
  assert.deepEqual(storyMissing({ ...FULL, county: "" }), ["縣市"]);
  assert.deepEqual(storyMissing({ ...FULL, quote: "", city: "" }), ["現在的城市", "一句話"]);
});

// 英文是選填的，沒有就顯示中文那一份（/alumni/ 本來就是這樣）。
test("英文欄位不填也算填齊了", () => {
  assert.deepEqual(storyMissing({ ...FULL, quote_en: "", note_en: "" }), []);
});

test("四種狀態各有一句話", () => {
  assert.match(storyStatus({ ...FULL, public_story: false }), /還沒有勾/);
  assert.match(storyStatus({ ...FULL, public_story: true, story_approved: false }), /等 Co-President/);
  assert.match(storyStatus({ ...FULL, public_story: true, story_approved: true }), /已經在公開的校友頁上/);
});

test("畫得出每一格，而且值會填回去", () => {
  const h = storyHTML({ role: "alumni", name_zh: "張小睿" }, FULL);
  assert.match(h, /張 O 睿/);
  assert.match(h, /高雄中學/);
  assert.match(h, /UBC/);
  assert.match(h, /現在換我回去講/);
  // 16 個縣市都要在選單裡
  for (const c of COUNTIES) assert.match(h, new RegExp(">" + c + "<"));
});

// 名字沒填就用 profiles 的中文姓名，不要逼他再打一次。
test("公開顯示的名字空著時，提示帶的是他的中文姓名", () => {
  const h = storyHTML({ role: "alumni", name_zh: "張小睿" }, { ...FULL, display_name: "" });
  assert.match(h, /張小睿/);
});

// ⚠ 高中生還沒出發，這一區對他沒有意義。
test("★ 學員看不到「我的故事」這一區", () => {
  const h = settingsHTML({ role: "student", email: "a@b.c" }, "", false, null);
  assert.equal(/我的故事/.test(h), false);
});

test("★ 幹部與校友都看得到", () => {
  for (const role of ["cadre", "alumni"]) {
    const h = settingsHTML({ role, email: "a@b.c" }, "", false, FULL);
    assert.match(h, /我的故事/);
  }
});

// 同意的時候要看得到自己正在公開什麼，逐項列出來，不是一句「公開個人資料」。
test("★ 同意那一句逐項列出會公開的東西", () => {
  const h = storyHTML({ role: "alumni", name_zh: "張小睿" }, FULL);
  for (const w of ["名字", "大頭照", "高中", "城市", "一句話", "介紹"]) assert.match(h, new RegExp(w));
});

// 離島現在不在島的資料裡。選不到就要說為什麼，不然那個人會以為是壞掉。
test("★ 離島的人看得到一句說明", () => {
  const h = storyHTML({ role: "alumni", name_zh: "張小睿" }, FULL);
  assert.match(h, /澎湖|金門|馬祖/);
});

// ⚠ alumni_stories 是欄位層級授權，id 只有 INSERT 權限、沒有 UPDATE 權限。
// .upsert() 展開後會把 id 塞進 UPDATE 的 SET 清單，整句被資料庫拒絕
//（症狀是「按了存起來，畫面什麼都沒發生」，2026-09-02 已經被同一件事咬過一次）。
// 所以這裡**不准出現 .upsert()**，要分成 insert / update 兩條路，
// 而且兩句都要是字面物件——check.sh 那條欄位對帳守門是用比對式讀原始碼的，
// `.update(patch)` 這種寫法它看不懂，會靜靜地跳過那個寫入點。
test("★ settings/src/main.js 寫 alumni_stories 分 insert / update 兩條路，都用字面物件，不用 upsert", () => {
  const src = readFileSync(new URL("../settings/src/main.js", import.meta.url), "utf8");
  assert.equal(/\.from\("alumni_stories"\)[\s\S]{0,80}?\.upsert\(/.test(src), false);
  assert.match(src, /\.from\("alumni_stories"\)[\s\S]{0,80}?\.insert\(\{/);
  assert.match(src, /\.from\("alumni_stories"\)[\s\S]{0,80}?\.update\(\{/);
  assert.equal(/\.from\("alumni_stories"\)[\s\S]{0,80}?\.(?:insert|update|upsert)\(\s*[^{\s]/.test(src), false);
});

// story_approved 由資料庫管。前端送它的話整句會被拒，而且那是在偷轉另一把鑰匙。
test("★ 前端不送 story_approved 與 approved_at", () => {
  const src = readFileSync(new URL("../settings/src/main.js", import.meta.url), "utf8")
    .split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
  assert.equal(/story_approved\s*:/.test(src), false);
  assert.equal(/approved_at\s*:/.test(src), false);
});
