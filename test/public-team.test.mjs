// 對外團隊頁的兩把鑰匙（2026-09-08，補批 1 漏掉的一件）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { peopleHTML, initial, toPerson, teamKey, byTeam } from "../team/src/ui.js";
import { settingsHTML } from "../settings/src/ui.js";
import { publicTeamHTML, tabsHTML } from "../admin/src/ui.js";

const P = (o = {}) => toPerson({ name_zh: "王小明", name_en: "Ming Wang", team: "Curriculum", ...o });

// ⚠ 這是對外頁面，「我們有三十個人但沒有人願意露臉」是內部資訊。
test("★ 一個人都沒有的時候回空字串，不是「還沒有人公開」", () => {
  assert.equal(peopleHTML([], "zh"), "");
  assert.equal(peopleHTML(null, "zh"), "");
});

test("有人的時候畫得出英文名、中文名與頭銜", () => {
  const h = peopleHTML([P({ public_title: "Director" })], "zh");
  assert.match(h, /Ming Wang/);
  assert.match(h, /王小明/);
  assert.match(h, /Director/);
});

// ⚠ 分組是這一版的重點：Paul 要的是「分成 team」。
test("★ 照 team 分組，順序照 TEAM_ORDER，不是照字母", () => {
  const h = peopleHTML([
    P({ name_en: "A", team: "Marketing" }),
    P({ name_en: "B", team: "Sponsorship" }),
    P({ name_en: "C", team: "Curriculum" }),
  ], "zh");
  const order = [...h.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m => m[1]);
  assert.deepEqual(order, ["Sponsorship", "Curriculum", "Marketing"]);
});

// profiles.team 是自由文字。三個只差一個字的分組看起來像資料壞掉。
test("★ 「Curriculum」「Curriculum Team」「curriculum team」是同一組", () => {
  assert.equal(teamKey("Curriculum"), "Curriculum");
  assert.equal(teamKey("Curriculum Team"), "Curriculum");
  assert.equal(teamKey(" curriculum   team "), "Curriculum");
  assert.equal(teamKey(""), "");
  assert.equal(teamKey(null), "");
  const g = byTeam([P({ team: "Curriculum" }), P({ team: "Curriculum Team" })]);
  assert.equal(g.length, 1, "同一個 team 被拆成兩組");
});

// 打錯字的人不能整個從頁面上消失。那比分錯組糟。
test("★ team 打錯字的人排在後面，但一定畫得出來；沒填 team 的排最後", () => {
  const g = byTeam([P({ name_en: "A", team: "" }), P({ name_en: "B", team: "Curiculum" }),
                    P({ name_en: "C", team: "Curriculum" })]);
  assert.deepEqual(g.map(x => x.key), ["Curriculum", "Curiculum", ""]);
  const h = peopleHTML([P({ name_en: "Typo Person", team: "Curiculum" })], "zh");
  assert.match(h, /Typo Person/);
});

test("沒有大頭照的人用名字第一個字，不是灰色剪影", () => {
  const h = peopleHTML([P({ name_zh: "王小明", name_en: "" })], "zh");
  assert.match(h, /class="noface"/);
  assert.match(h, />王</);
  assert.doesNotMatch(h, /<img/);
});

// ⚠ s[0] 會把某些字切成半個字元，畫面上出現問號方塊。
test("★ 第一個字要用 [...s][0]，不是 s[0]", () => {
  assert.equal(initial("王小明"), "王");
  assert.equal(initial("🙂笑"), "🙂");
  assert.equal(initial(""), "?");
  assert.equal(initial(null), "?");
});

test("有大頭照就畫圖，而且 lazy", () => {
  const h = peopleHTML([P({ avatar: "data:image/jpeg;base64,x" })], "zh");
  assert.match(h, /loading="lazy"/);
});

// ⚠ 這是「頭超出卡片」那個效果的開關，而它沒有資料庫欄位 ——
// 判斷完全靠圖檔格式。jpeg 沒有透明，所以 jpeg 一定是一般大頭照（畫成圓的）；
// webp / png 才可能是去背照（畫成超出卡片的那張）。
// 這條壞掉的話，一般大頭照會被當成去背照拉長掛在卡片外面，很難看但不會報錯。
test("★ jpeg 是一般大頭照（圓的），webp / png 是去背照（超出卡片）", () => {
  assert.equal(toPerson({ avatar: "data:image/jpeg;base64,x" }).cut, false);
  assert.equal(toPerson({ avatar: "data:image/jpg;base64,x" }).cut, false);
  assert.equal(toPerson({ avatar: "data:image/webp;base64,x" }).cut, true);
  assert.equal(toPerson({ avatar: "data:image/png;base64,x" }).cut, true);
  assert.equal(toPerson({ avatar: "" }).cut, false, "沒有照片不是去背照");
  assert.match(peopleHTML([P({ avatar: "data:image/webp;base64,x" })], "zh"), /class="cut"/);
  assert.match(peopleHTML([P({ avatar: "data:image/jpeg;base64,x" })], "zh"), /class="por"/);
});

// ⚠ 上傳那一端要留得住透明，不然去背照存下去會變成黑色方塊，
// 而上面那條「靠格式判斷」也會永遠判成 false。兩件事是同一個約定的兩半。
test("★ 設定頁的壓縮不准把有透明的照片存成 jpeg", () => {
  const src = readFileSync("settings/src/main.js", "utf8");
  assert.match(src, /hasAlpha/, "沒有在看有沒有透明像素");
  assert.match(src, /image\/webp/, "有透明的時候沒有存成留得住透明的格式");
});

// 拍照那天的姿勢會互相連動（往右看的人，右邊那個比「噠噠」），
// auto-fill 的話「誰在誰右邊」會隨視窗寬度變，姿勢就對不起來。
test("★ /team/ 的欄數是寫死的，不是 auto-fill", () => {
  const css = readFileSync("team/index.html", "utf8");
  const m = css.match(/\.crew\{[^}]*\}/);
  assert.ok(m, "找不到 .crew 的規則");
  assert.match(m[0], /grid-template-columns:repeat\(4,/);
  assert.doesNotMatch(m[0], /auto-fill|auto-fit/);
});

// ⚠ 整站的語言切換是 html[data-lang="en"] .zh{display:none}。
// 中文名那一格如果取名叫 zh，英文版會把每個人的中文名整個藏起來，
// 而且不會報錯 —— 只是畫面上少了東西。2026-09-08 踩過一次。
test("★ 卡片裡不准用 zh / en 當 class 名（會被語言切換藏掉）", () => {
  const h = peopleHTML([P({ public_title: "Director" })], "en");
  assert.doesNotMatch(h, /class="(zh|en)"/);
  assert.match(h, /王小明/, "英文版一樣要看得到中文名");
});

test("toPerson 只收斂一次（中文名優先，沒有就用英文名）", () => {
  assert.equal(toPerson({ name_zh: "王小明", name_en: "Paul" }).name, "王小明");
  assert.equal(toPerson({ name_zh: null, name_en: "Paul" }).name, "Paul");
  assert.equal(toPerson({}).name, "");
});

test("跳脫：名字與大頭照的網址都掙不出標籤", () => {
  const h = peopleHTML([toPerson({ name_zh: '<img src=x>', name_en: "",
                                   avatar: 'x" onerror="alert(1)' })], "zh");
  assert.ok(!h.includes("<img src=x"), "名字沒有跳脫");
  // ⚠ 斷言要看的是**掙不掙得出屬性**，不是字串裡有沒有 onerror。
  // 跳脫過的值裡照樣看得到 onerror= 這幾個字，但它被關在 &quot; 裡面，
  // 那是安全的。斷言寫成 !includes("onerror=") 會誤判正確的程式。
  assert.ok(!h.includes('" onerror'), "引號沒有跳脫，掙得出屬性");
  assert.match(h, /&quot; onerror/);
});

// ── 第一把鑰匙：本人打勾（2026-09-08 搬到 /settings/）─────────────────
const cadre = (extra = {}) => ({ role: "cadre", name_zh: "王平", email: "a@b.c", ...extra });

// ⚠ 文案要把後果講在前面。一個高中生幹部按下去之前需要知道的是這個。
test("★ 打勾之前就講清楚後果：公開網頁、任何人看得到、會被搜尋引擎收錄", () => {
  const h = settingsHTML(cadre(), "", false);
  assert.match(h, /任何人都看得到/);
  assert.match(h, /搜尋引擎/);
  assert.match(h, /不打勾完全沒有關係/);
});

// ⚠ 這是搬到設定頁的**理由本身**：設定的地方要跟後果的地方在同一個畫面上。
test("★ 大頭照與「要不要公開」在同一個畫面上", () => {
  const h = settingsHTML(cadre({ avatar: "data:image/jpeg;base64,x" }), "", false);
  assert.match(h, /data-act="avatar"/, "設定頁要能換大頭照");
  assert.match(h, /id="pub"/, "公開開關要在同一頁");
  assert.ok(h.indexOf('data-act="avatar"') < h.indexOf('id="pub"'),
    "照片要在勾選框上面，他才看得到自己正在公開什麼");
});

test("打勾之後才出現頭銜那一格，而且說出還要等核可", () => {
  assert.doesNotMatch(settingsHTML(cadre(), "", false), /id="ptitle"/);
  const on = settingsHTML(cadre({ public_profile: true }), "", false);
  assert.match(on, /id="ptitle"/);
  assert.match(on, /還要等 Co-President 核可/);
  assert.match(settingsHTML(cadre({ public_profile: true, public_approved: true }), "", false),
    /已經在公開的團隊頁上了/);
});

test("★ 學員的設定頁沒有公開那一塊，也沒有大頭照", () => {
  const h = settingsHTML({ role: "student", name_zh: "小明", email: "a@b.c" }, "", false);
  assert.doesNotMatch(h, /id="pub"/, "學員不會出現在團隊頁上，不該看到那個勾");
  assert.doesNotMatch(h, /data-act="avatar"/);
  assert.match(h, /id="school"/, "學員要改得了學校");
  assert.match(h, /id="grade"/);
});

// ⚠ 資料不設保存期限（2026-09-07 拍板）的對價：當事人隨時拿得回控制權。
test("★ 學員的設定頁上找得到刪除帳號；幹部那一頁沒有（換屆交接的事）", () => {
  assert.match(settingsHTML({ role: "student", name_zh: "小明" }, "", false),
    /data-act="ask-delete"/);
  const c = settingsHTML(cadre(), "", false);
  assert.doesNotMatch(c, /data-act="ask-delete"/);
  assert.match(c, /換屆交接/, "幹部要知道為什麼自己刪不了，而不是找不到按鈕");
});

// ── 第二把鑰匙：P/VP 核可 ─────────────────────────────────────────────
// ⚠ 系統沒有生日欄位，「未滿 18 不放」技術上擋不住。
// 這一頁是那件事唯一會被看到的地方。
test("★ 核可那一頁一定要有那兩句提醒", () => {
  const h = publicTeamHTML([], "", false);
  assert.match(h, /滿 18 歲/);
  assert.match(h, /隱私政策改了嗎/);
  assert.match(h, /撤不乾淨/);
});

test("只列已經自己打過勾的人；一個都沒有的時候說明為什麼", () => {
  const h = publicTeamHTML([], "", false);
  assert.match(h, /還沒有人自己打勾/);
  assert.match(h, /要先到 \/app\/ 打勾/);
});

test("核可清單顯示狀態", () => {
  const h = publicTeamHTML([
    { id: "1", name_zh: "王小明", team: "Curriculum", public_title: "Director",
      avatar: "x", public_approved: true },
    { id: "2", name_zh: "陳小安", team: "", public_title: "", avatar: null, public_approved: false },
  ], "", false);
  assert.match(h, /在公開頁面上/);
  assert.match(h, /還沒核可/);
  assert.match(h, /有大頭照/);
  assert.match(h, /沒有大頭照/);
  assert.match(h, /沒有填 team/);
});

test("★ 只有 Co-President 看得到「團隊頁」這個分頁", () => {
  assert.doesNotMatch(tabsHTML("forms", false), /data-t="team"/);
  assert.match(tabsHTML("forms", true), /data-t="team"/);
});

// 核可完要回得了申請表。兩個核可頁都要有，只加一頁會讓兩頁不一致。
test("★ 團隊頁本身畫得出分頁列（核可完回得去申請表）", () => {
  const h = publicTeamHTML([], "", false);
  assert.match(h, /data-act="tab"/);
  assert.match(h, /data-t="forms"/);
});

// ── 一個人可以在好幾個 team（Paul 2026-09-10）──────────────────────
// profiles.team 存的是「A Team, B Team」這種逗號字串（沒有為此開新欄位）。
test("★ 在兩個 team 的人，兩組都會出現", () => {
  const h = peopleHTML([P({ name_en: "Both", team: "Curriculum Team, Marketing Team" })], "zh");
  const groups = [...h.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m => m[1]);
  assert.deepEqual(groups, ["Curriculum", "Marketing"]);
  assert.equal((h.match(/Both/g) || []).length, 2, "兩組各出現一次");
});

// ⚠ 兩個寫法收斂完撞在一起的時候只能算一次，不然那個人會在同一組裡出現兩次。
test("★ 「CR, Community Relations Team」收斂完是同一組，只出現一次", () => {
  const h = peopleHTML([P({ name_en: "Solo", team: "CR, Community Relations Team" })], "zh");
  assert.deepEqual([...h.matchAll(/<h3>([^<]+)<\/h3>/g)].map(m => m[1]), ["CR"]);
  assert.equal((h.match(/Solo/g) || []).length, 1);
});

test("一個 team 都沒填的人歸到最後那一組，不會消失", () => {
  const h = peopleHTML([P({ name_en: "Nobody", team: "" })], "zh");
  assert.match(h, /Nobody/);
  assert.match(h, /還有這些人/);
});
