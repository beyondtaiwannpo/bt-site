// 「我的故事」（2026-09-11）。幹部與校友填，Co-President 核可，出現在 /alumni/ 上。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTIES, storyMissing, storyStatus, storyHTML, settingsHTML } from "../settings/src/ui.js";
import { alumniStoriesHTML, tabsHTML } from "../admin/src/ui.js";
import { says } from "../admin/src/data.js";

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

// ── 第三把鑰匙：Co-President 在 /admin/ 核可（2026-09-11）─────────────
// 這一頁是「兩把鑰匙」裡的第二把唯一會被按下去的地方。
const ROW = { id: "u1", name: "張 O 睿", school: "高雄中學", city: "Vancouver",
  country: "加拿大", place: "UBC", quote: "現在換我回去講。", note: "第一次接觸 BT 是在高雄。",
  public_story: true, story_approved: false, updated_at: "2026-09-11T02:00:00Z" };

// 核可的是內容不是名字。看不到那段文字就沒辦法判斷能不能用 BT 的名義公開。
test("★ 核可清單上看得到完整內容", () => {
  const h = alumniStoriesHTML([ROW], "", false);
  for (const w of ["張 O 睿", "高雄中學", "Vancouver", "現在換我回去講", "第一次接觸 BT"])
    assert.match(h, new RegExp(w));
});

// 系統沒有生日欄位，「未滿 18 不放」只有人擋得住，而這裡是唯一會被看到的地方。
//
// ⚠ 三條斷言各自錨定**那一件事獨有的後半句**，不是一個籠統的詞。
// 第一版寫的是 /校友/ 與 /BT 的名義|公開/，那兩條是恆真的：
// 前者被 <h2>校友頁</h2> 餵飽、後者被「已經公開 N 人」餵飽 ——
// 三件事整段刪掉，那條測試照樣全綠，而它的名字宣稱守著三件。
// 這跟破壞測試時改到 publicTeamHTML() 那句一模一樣的字面是同一個教訓：
// **錨點要挑這一頁獨有的片段。**
test("★ 核可前要確認的三件事都寫在頁面上", () => {
  const h = alumniStoriesHTML([ROW], "", false);
  assert.match(h, /滿 18 歲/);
  assert.match(h, /邀請碼可能被轉給別人/);
  assert.match(h, /可以用 BT 的名義公開嗎/);
});

// ⚠ 縣市是空的人，核可了也**不會出現在航線圖上** ——
// public_alumni() 有一句 s.county is not null，理由是「與其讓他半出現，
// 不如整列不回，這樣後台看得到他還沒填縣市」。
// **後台就是這一頁**，所以那句話要在這裡成立，不然兩邊都看不出哪裡不對：
// Co-President 按了核可，那個人安靜地沒出現，沒有任何錯誤訊息。
test("★ 沒填縣市的人看得出來（核可了也不會出現在航線圖上）", () => {
  assert.match(alumniStoriesHTML([{ ...ROW, county: "" }], "", false), /沒填縣市/);
  assert.equal(/沒填縣市/.test(alumniStoriesHTML([{ ...ROW, county: "高雄" }], "", false)), false,
    "填了縣市的人不該掛這顆標籤");
});

test("等核可的排在已經公開的前面", () => {
  const h = alumniStoriesHTML([
    { ...ROW, id: "a", name: "已公開的人", story_approved: true },
    { ...ROW, id: "b", name: "等核可的人", story_approved: false },
  ], "", false);
  assert.ok(h.indexOf("等核可的人") < h.indexOf("已公開的人"), "等核可的沒有排在最上面");
});

// 沒有人勾的時候不要畫一份「還沒有人問過」的名單，那會讓人很想直接核可。
test("★ 一個人都沒勾的時候說清楚下一步在哪", () => {
  const h = alumniStoriesHTML([], "", false);
  assert.match(h, /還沒有人/);
  assert.match(h, /設定/);
});

test("★ 校友頁分頁只有 Co-President 看得到", () => {
  assert.match(tabsHTML("stories", true), /data-t="stories"/);
  assert.equal(/data-t="stories"/.test(tabsHTML("forms", false)), false);
});

// ⚠ profiles 的讀取政策**不涵蓋校友那幾列**（2026-09-13-public-team.sql）。
// 後台直接查 profiles 補名字，對校友永遠是空的 —— 畫面會顯示「（沒有名字）」，
// 而那正是核可時最該看到的東西。名字要在 stories_for_review() 裡就解析好。
// 這條守的是那個決定本身：有人「順手」把查 profiles 那段加回來就會紅。
test("★ loadStories 只呼叫 stories_for_review()，不自己去查 profiles 補名字", () => {
  const src = readFileSync(new URL("../admin/src/data.js", import.meta.url), "utf8");
  const m = src.match(/export async function loadStories\(\)[\s\S]*?\n\}/);
  assert.ok(m, "找不到 loadStories()");
  assert.match(m[0], /supabase\.rpc\("stories_for_review"\)/);
  assert.equal(/\.from\(/.test(m[0]), false, "loadStories 又自己去查表了");
});

// 失敗一定要說話，而且要說實話：set_story_approved() 丟得出兩種錯誤碼，
// 兩種都要對得上人看得懂的中文，不然按按鈕的人會往錯的方向找。
test("★ 核可失敗時看得到真正的原因（兩種錯誤碼都翻成中文）", () => {
  assert.match(says(new Error("not_president")), /Co-President/);
  const m = says(new Error("not_alumni_or_cadre"));
  assert.match(m, /不是幹部|不是校友|校友/);
  assert.equal(/not_alumni_or_cadre/.test(m), false, "把資料庫的代碼原封不動丟給人看");
});

// story_approved 由資料庫管。前端送它的話整句會被拒，而且那是在偷轉另一把鑰匙。
test("★ 前端不送 story_approved 與 approved_at", () => {
  const src = readFileSync(new URL("../settings/src/main.js", import.meta.url), "utf8")
    .split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
  assert.equal(/story_approved\s*:/.test(src), false);
  assert.equal(/approved_at\s*:/.test(src), false);
});

// ── 第四步：/alumni/ 先讀資料庫，沒有真人才退回示範資料（2026-09-11）──────
const page = readFileSync(new URL("../alumni/index.html", import.meta.url), "utf8");

// 這一頁是對外頁面，載整包 supabase-js 會讓每個路人多下載一份他用不到的東西。
test("★ /alumni/ 仍然不載 supabase 套件", () => {
  assert.equal(/vendor\/supabase-js/.test(page), false);
  assert.equal(/from "\.\.\/shared\/supabase\.js"/.test(page), false);
});

// 金鑰只有一份。這一頁用動態 import 去拿那支只有常數的小檔。
test("★ 金鑰是 import 來的，不是又寫死一份", () => {
  assert.match(page, /import\("\.\.\/shared\/supabase-config\.js"\)/);
  assert.equal(/sb_publishable_/.test(page), false);
});

// 資料庫空的或連不上的時候，對外頁面不能空著，也不該講內部狀態。
test("★ 讀不到資料庫就退回 community.json", () => {
  assert.match(page, /public_alumni/);
  assert.match(page, /community\.json/);
});
