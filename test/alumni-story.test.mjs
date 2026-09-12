// 「我的故事」（2026-09-11）。幹部與校友填，Co-President 核可，出現在 /alumni/ 上。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTIES, storyMissing, storyStatus, storyHTML, settingsHTML,
         saveFailMessage } from "../settings/src/ui.js";
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

// ── 校友的設定頁：整條路在中段斷掉（2026-09-11 總審查的 C1 與 I2）──────
//
// 症狀：校友填完故事按「存起來」，看到的是「姓名、學校、年級三個都要填」，
// 故事一個字都沒有被送出。成因是設定頁只有「幹部 / 不是幹部」兩分法，
// 校友掉進學員那一條，而那條路在任何故事程式碼之前就 return。
//
// **375 條測試全綠，因為沒有一條斷言「校友不該看到年級」。**
// 下面這幾條就是那個缺口：它們看的是校友那一份畫面本身。
const ALUM = { role: "alumni", name_zh: "張小睿", name_en: "Rui Chang", email: "a@b.c" };
const STUDENT = { role: "student", name_zh: "小明", email: "a@b.c" };
const CADRE = { role: "cadre", name_zh: "王平", email: "a@b.c" };

test("★ 校友的設定頁不可以出現「年級」與「就讀學校」（那是問高中生的）", () => {
  const h = settingsHTML(ALUM, "", false, FULL);
  assert.equal(/id="grade"/.test(h), false, "校友看到了年級那一格");
  assert.equal(/id="school"/.test(h), false, "校友看到了「就讀學校」那一格");
  assert.equal(/年級/.test(h), false);
  assert.equal(/就讀學校/.test(h), false);
  // 電子報同意是註冊時問高中生的事，校友那一頁沒有。
  assert.equal(/id="nl"/.test(h), false);
});

test("★ 校友的設定頁要有中文姓名與英文姓名", () => {
  const h = settingsHTML(ALUM, "", false, FULL);
  assert.match(h, /id="nzh"/);
  assert.match(h, /id="nen"/);
  assert.match(h, /中文姓名/);
  assert.match(h, /英文姓名/);
});

// ⚠ 同意書寫著「我同意把我的名字、**大頭照**、高中…放上公開的校友頁」，
// 而 public_alumni_avatar() 拿的正是 profiles.avatar。
// 沒有這一區的話，我們對他宣告的公開範圍裡有一個他給不了的東西。
test("★ 校友的設定頁要有大頭照那一區，說明講的是校友頁不是進度牆", () => {
  const h = settingsHTML(ALUM, "", false, FULL);
  assert.match(h, /data-act="avatar"/, "校友換不了大頭照");
  assert.match(h, /故事被核可之後/, "沒有說清楚那張照片什麼時候才會對外出現");
  assert.equal(/進度牆/.test(h), false, "校友不在幹部的進度牆上");
  assert.equal(/id="pub"/.test(h), false, "校友不會出現在公開團隊頁上，不該看到那個勾");
});

// 三分法的另外兩份**一個字都不可以變**。這一條是上面那些改動的安全網。
test("★ 幹部與學員各自的畫面沒有變", () => {
  const c = settingsHTML(CADRE, "", false, FULL);
  assert.match(c, /id="nzh"/); assert.match(c, /id="nen"/);
  assert.match(c, /所屬 team/);
  assert.match(c, /data-act="avatar"/); assert.match(c, /id="pub"/);
  assert.match(c, /進度牆/);
  assert.match(c, /我的故事/);

  const s = settingsHTML(STUDENT, "", false, null);
  assert.match(s, /id="school"/); assert.match(s, /id="grade"/); assert.match(s, /id="nl"/);
  assert.equal(/data-act="avatar"/.test(s), false);
  assert.equal(/我的故事/.test(s), false);
  assert.match(s, /data-act="ask-delete"/);
});

// ⚠ 存檔那條路也要認得三種人，不然畫面對了、按下去還是被擋。
// 這一條的形狀跟 check.sh 那條欄位對帳守門一樣（讀原始碼），理由也一樣：
// 每一句 update 都寫成字面物件，看得懂才守得到。
test("★ 存檔有三條路，校友那一句只寫姓名，不碰 school / grade", () => {
  const src = readFileSync(new URL("../settings/src/main.js", import.meta.url), "utf8")
    .split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n");
  const sites = src.match(/\.from\("profiles"\)[\s\S]{0,80}?\.update\(\{[\s\S]*?\}\)/g) || [];
  assert.equal(sites.length, 4,
    "profiles 的寫入點應該是四個：大頭照、幹部、校友、學員");
  const alum = sites.find(s => /name_en/.test(s) && !/public_profile/.test(s));
  assert.ok(alum, "找不到校友那條存檔路徑（只寫中文姓名與英文姓名的那一句）");
  assert.equal(/school|grade|newsletter/.test(alum), false,
    "校友那一句寫了他畫面上根本沒有的欄位");
  assert.match(src, /const alumni = S\.me\.role === "alumni";/);
});

// ⚠ 失敗一定要說話，而且要說實話。profiles 存好了、故事那一句才失敗的時候，
// 只說「存不起來」會讓他以為整頁都沒存到，於是把已經存好的東西再改一次。
test("★ 只有後半失敗的時候，訊息說得出是哪一半", () => {
  const both = saveFailMessage(false, new Error("網路斷了"));
  assert.match(both, /存不起來/);
  assert.match(both, /網路斷了/);
  assert.equal(/我的故事/.test(both), false);

  const half = saveFailMessage(true, new Error("permission denied"));
  assert.match(half, /你的資料存起來了/);
  assert.match(half, /我的故事/);
  assert.match(half, /permission denied/);
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

// 核可完要回得了申請表。少了分頁列就只能重新載入整頁，
// 而 Paul 就是要一個一個按核可的人。
test("★ 校友頁本身畫得出分頁列（核可完回得去申請表）", () => {
  const h = alumniStoriesHTML([ROW], "", false);
  assert.match(h, /data-act="tab"/);
  assert.match(h, /data-t="forms"/);
});

// ⚠ touch_updated_at() 是 before update 的 trigger，而核可本身也是一句 update，
// 所以按下核可之後 updated_at 就變成核可時間。
// 「內容最後改過」對**已核可**的人會說謊，而那是人在做安全判斷時看的資訊。
test("★ 已核可的顯示「核可於」，等核可的才顯示「內容最後改過」", () => {
  const waiting = alumniStoriesHTML([{ ...ROW, story_approved: false }], "", false);
  assert.match(waiting, /內容最後改過：2026-09-11/);
  assert.equal(/核可於/.test(waiting), false);

  const done = alumniStoriesHTML([{ ...ROW, story_approved: true,
    updated_at: "2026-09-12T05:00:00Z", approved_at: "2026-09-12T05:00:00Z" }], "", false);
  assert.match(done, /核可於：2026-09-12/);
  assert.equal(/內容最後改過/.test(done), false,
    "核可這個動作自己蓋掉了 updated_at，那一行對已核可的人是假的");
});

// 上面那一行要成立，資料庫那一支就得多回一欄。
test("★ stories_for_review() 回傳的欄位含 approved_at", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/2026-09-19-stories-for-review.sql", import.meta.url), "utf8");
  assert.match(sql, /approved_at timestamptz/);
  assert.match(sql, /s\.approved_at/);
  // 驗收表比對的那一串欄位名也要跟著改，不然畫面少一欄而且不會報錯。
  const want = "id,name,school,county,city,country,place,quote,note," +
               "public_story,story_approved,updated_at,approved_at";
  assert.ok((sql.match(new RegExp(want, "g")) || []).length >= 2,
    "驗收表裡的欄位名清單沒有跟著加 approved_at");
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
