// 對外團隊頁的兩把鑰匙（2026-09-08，補批 1 漏掉的一件）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { peopleHTML, initial, toPerson } from "../team/src/ui.js";
import { settingsHTML } from "../settings/src/ui.js";
import { publicTeamHTML, tabsHTML } from "../admin/src/ui.js";

// ⚠ 這是對外頁面，「我們有三十個人但沒有人願意露臉」是內部資訊。
test("★ 一個人都沒有的時候回空字串，不是「還沒有人公開」", () => {
  assert.equal(peopleHTML([]), "");
  assert.equal(peopleHTML(null), "");
});

test("有人的時候畫得出名字、頭銜與 team", () => {
  const h = peopleHTML([{ name: "王小明", team: "Curriculum", title: "Director", avatar: "" }]);
  assert.match(h, /王小明/);
  assert.match(h, /Director・Curriculum/);
});

test("沒有大頭照的人用名字第一個字，不是灰色剪影", () => {
  const h = peopleHTML([{ name: "王小明", team: "", title: "", avatar: "" }]);
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
  const h = peopleHTML([{ name: "A", team: "", title: "", avatar: "data:image/jpeg;base64,x" }]);
  assert.match(h, /loading="lazy"/);
});

test("toPerson 只收斂一次（中文名優先，沒有就用英文名）", () => {
  assert.equal(toPerson({ name_zh: "王小明", name_en: "Paul" }).name, "王小明");
  assert.equal(toPerson({ name_zh: null, name_en: "Paul" }).name, "Paul");
  assert.equal(toPerson({}).name, "");
});

test("跳脫：名字與大頭照的網址都掙不出標籤", () => {
  const h = peopleHTML([{ name: '<img src=x>', team: "", title: "",
                          avatar: 'x" onerror="alert(1)' }]);
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
