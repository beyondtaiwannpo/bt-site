// 看板的畫面契約。
import { test } from "node:test";
import assert from "node:assert/strict";
import { noticeHTML, membersHTML, downHTML, COL_ORDER, DAY_ZH, hhmm,
         teamsOf, filterByTeam, teamFilterHTML, setLang } from "../availability/src/ui.js";
// 時間看板 2026-10-19 起有中英切換，字典預設英文；這一支斷言的是中文，所以先切成中文。
setLang("zh");
import { namesOf } from "../availability/src/data.js";

// ★ 2026-09-02 的 bug：知情同意按下去完全沒反應，而且沒有任何錯誤訊息。
// 根因有兩個，這一條守第二個 —— **失敗一定要說話**。
// 沒有它的話，任何一種請求失敗都會畫出一模一樣的畫面，
// 而使用者按了沒反應只會再按一次、按五次、然後關掉。
test("★ 知情同意頁失敗時要把訊息畫出來", () => {
  const clean = noticeHTML();
  const withMsg = noticeHTML("現在連不上資料庫。");
  assert.ok(!clean.includes("現在連不上資料庫"), "沒有訊息時不該憑空出現");
  assert.ok(withMsg.includes("現在連不上資料庫。"), "有訊息時沒有畫出來 —— 使用者會以為按鈕壞了");
  assert.notEqual(clean, withMsg, "有訊息與沒訊息畫出來一模一樣，等於訊息沒有作用");
});

test("知情同意頁處理中會停用按鈕，不讓人連點", () => {
  const busy = noticeHTML("", true);
  assert.match(busy, /data-act="notice-ok"[^>]*disabled/, "處理中沒有停用按鈕");
  assert.ok(busy.includes("處理中"), "沒有告訴他正在處理");
});

test("知情同意頁把那句話講清楚，而且走得掉", () => {
  const h = noticeHTML();
  assert.ok(h.includes("其他 BT 幹部看得到"), "沒有講最重要的那一句");
  assert.ok(h.includes("data-act=\"notice-ok\""), "沒有確認鍵");
  assert.ok(h.includes("../app/"), "沒有「先不要」的出口");
});

test("欄位順序是週一到週日，但存的仍然是 0 = 星期日", () => {
  assert.deepEqual(COL_ORDER, [1, 2, 3, 4, 5, 6, 0]);
  assert.equal(DAY_ZH[0], "日");
  assert.equal(DAY_ZH[COL_ORDER[0]], "一", "第一欄應該是星期一");
});

test("hhmm 補零", () => {
  assert.equal(hhmm(0), "00:00");
  assert.equal(hhmm(90), "01:30");
  assert.equal(hhmm(1410), "23:30");
});

// 規格 §4-3 C：沒有這一區就不知道該催誰。從沒填過與沒設時區的人都要出現。
const S = {
  members: [
    { id: "a", name: "有填的人", team: "Curriculum Team", tz: "Asia/Taipei", updatedAt: new Date().toISOString() },
    { id: "b", name: "很久沒動的人", team: "", tz: "America/Detroit", updatedAt: new Date(Date.now() - 60 * 86400000).toISOString() },
    { id: "c", name: "從沒填過的人", team: "", tz: "Asia/Taipei", updatedAt: null },
    { id: "d", name: "沒設時區的人", team: "", tz: null, updatedAt: null },
  ],
  slots: new Map([["a", new Set(["1:1140"])]]),
};

test("成員清單列出所有人，含從沒填過與沒設時區的", () => {
  const h = membersHTML(S, Date.now());
  for (const m of S.members) assert.ok(h.includes(m.name), `${m.name} 不見了 —— 少了誰看不出來`);
  assert.ok(h.includes("還沒填過"), "沒有標出從沒填過的人");
  assert.ok(h.includes("還沒設定時區"), "沒有標出沒設時區的人");
});

test("超過 30 天的標成該更新，而剛更新的不標", () => {
  const h = membersHTML(S, Date.now());
  const rows = h.split("<tr").filter(r => r.includes("</tr>"));
  const stale = rows.filter(r => r.includes("stale"));
  assert.equal(stale.length, 3, "應該有三列是舊的（60 天、兩個沒填過）");
  assert.ok(rows.find(r => r.includes("有填的人") && !r.includes("stale")), "剛更新的不該被標");
  assert.ok(h.includes("該更新了"), "只有底色沒有文字的話，色盲與黑白列印讀不到");
});

test("沒設時區的人在清單裡，而且說明他為什麼不在看板上", () => {
  const h = membersHTML(S, Date.now());
  assert.ok(h.includes("不會出現在團隊看板上"),
    "沒有解釋他為什麼不在看板上 —— 那看起來會像他沒空");
});

test("連不上的那一頁給得出下一步", () => {
  const h = downHTML();
  assert.ok(h.includes("beyondtaiwan2020@gmail.com"));
  assert.ok(h.includes('data-act="retry"'));
});

// ── 外殼（2026-11-26 起只剩兩個分頁）───────────────────────────────
// 「團隊看板」分頁與點一格打開的彈窗拿掉了，大家有空的人數與排會搬到首頁行事曆點一天（test/home-day.test.mjs）。
import { shellHTML } from "../availability/src/ui.js";

// S.msg 設了卻沒有地方畫，等於又做了一個「按了沒反應」的按鈕。
test("★ shellHTML 會把訊息畫出來", () => {
  const withMsg = shellHTML("mine", "<i>x</i>", "9/1 – 9/7", "只能往前看四週。");
  const without = shellHTML("mine", "<i>x</i>", "9/1 – 9/7", "");
  assert.ok(withMsg.includes("只能往前看四週。"), "訊息沒有被畫出來");
  assert.notEqual(withMsg, without, "有訊息跟沒訊息畫出來一樣，等於訊息沒有作用");
});

test("★ 只剩「我的時間」與「成員」兩個分頁，旁邊一顆連到首頁行事曆", () => {
  const h = shellHTML("mine", "", null, "");
  assert.deepEqual([...h.matchAll(/data-t="(\w+)"/g)].map(m => m[1]), ["mine", "who"]);
  assert.doesNotMatch(h, /data-t="board"/);
  assert.match(h, /<a class="btn ghost sm tocal" href="\.\.\/home\/\?lang=zh#calendar">看大家有空的時間、排會<\/a>/);
  assert.match(h, /aria-current="true">我的時間/);
  assert.match(shellHTML("who", "", null, ""), /data-t="who"\s+aria-current="true"/);
});

// ── 名字要中英文都出現（2026-09-10）──────────────────────────────────
// Paul 的原話：「上面都是中文名不知道是誰」。幹部分布七個國家，
// 很多人平常只用英文名互相稱呼；認不出是誰就不知道該催誰，
// 而「知道該催誰」是這一頁存在的理由（規格 §4-3 C）。
test("★ 成員清單同時顯示中文名與英文名", () => {
  const h = membersHTML({ ...S, members: [
    { id: "a", name: "林育安", alt: "Lin Yu-An", team: "Curriculum Team",
      tz: "Asia/Taipei", updatedAt: new Date().toISOString() },
  ] }, Date.now());
  assert.ok(h.includes("林育安"), "中文名不見了");
  assert.ok(h.includes("Lin Yu-An"), "英文名不見了");
});

// 三種人都不能因為少了一個名字就變成空白或重複。
// 名單上少一個人比排版醜嚴重得多 —— 少的那個就不會被催。
test("★ 只有一個名字、或兩欄一樣的人，照樣只出現一次而且看得到", () => {
  const one = (m) => membersHTML({ ...S, members: [{ team: "", tz: null, updatedAt: null, ...m }] },
                                 Date.now());
  const onlyZh = one({ id: "1", name: "只有中文", alt: "" });
  assert.ok(onlyZh.includes("只有中文"));
  assert.doesNotMatch(onlyZh, /class="alt"/, "沒有第二個名字時不該畫出空的那一格");

  const onlyEn = one({ id: "2", name: "Only English", alt: "" });
  assert.ok(onlyEn.includes("Only English"), "只有英文名的人整個不見了");

  const same = one({ id: "3", name: "Paul", alt: "" });
  assert.equal((same.match(/Paul/g) || []).length, 1, "同一個名字被印了兩次");

  const none = one({ id: "4", name: "（沒有名字）", alt: "" });
  assert.ok(none.includes("（沒有名字）"), "沒有名字的人不能整列變空白");
});

test("★ 名字會跳脫，兩個名字都是", () => {
  const h = membersHTML({ ...S, members: [
    { id: "x", name: "<img src=x>", alt: '"><script>', team: "", tz: null, updatedAt: null },
  ] }, Date.now());
  assert.ok(!h.includes("<img src=x"), "中文名沒有跳脫");
  assert.ok(!h.includes('"><scr' + 'ipt>'), "英文名沒有跳脫");
  assert.match(h, /&lt;img/);
});

// 四種邊界情況直接測那個純函式。上面那幾條測的是畫面，這幾條測的是規則本身 ——
// 規則寫錯的表現是「名單上少一個人」或「同一個名字印兩次」，兩種都不會報錯。
test("★ namesOf：只有中文、只有英文、兩欄一樣、兩欄都空", () => {
  assert.deepEqual(namesOf({ name_zh: "林育安", name_en: "Lin Yu-An" }),
    { name: "林育安", alt: "Lin Yu-An" });
  assert.deepEqual(namesOf({ name_zh: "只有中文", name_en: "" }),
    { name: "只有中文", alt: "" });
  assert.deepEqual(namesOf({ name_zh: null, name_en: "Only English" }),
    { name: "Only English", alt: "" }, "只有英文名的人要用英文名當主要的名字");
  assert.deepEqual(namesOf({ name_zh: "Paul", name_en: "Paul" }),
    { name: "Paul", alt: "" }, "兩欄一樣的人不該被印兩次");
  assert.deepEqual(namesOf({}), { name: "（沒有名字）", alt: "" },
    "兩欄都空的人不能整列變空白 —— 名單上少一個人就少催一個人");
});

// 前後空白是真的會發生的：手機鍵盤的自動空格、複製貼上帶進來的。
// 沒有 trim 的話「 Paul」與「Paul」會被當成兩個不同的名字，然後印兩次。
test("★ namesOf：前後空白要先去掉", () => {
  assert.deepEqual(namesOf({ name_zh: "  Paul ", name_en: "Paul" }),
    { name: "Paul", alt: "" });
  assert.deepEqual(namesOf({ name_zh: "   ", name_en: "Lin" }),
    { name: "Lin", alt: "" }, "只有空白的欄位等於沒填");
});

// ── team 篩選（2026-09-10）──────────────────────────────────────────
// Paul：「團隊看板那邊選一個 team 就可以只看到這個 team 的所有人」。
const T = [
  { id: "a", name: "甲", alt: "", team: "Curriculum Team", tz: "Asia/Taipei", updatedAt: null },
  { id: "b", name: "乙", alt: "", team: "Sponsorship Team", tz: "Asia/Taipei", updatedAt: null },
  { id: "c", name: "丙", alt: "", team: " Curriculum Team ", tz: null, updatedAt: null },
  { id: "d", name: "丁", alt: "", team: "", tz: null, updatedAt: null },
];

// ⚠ 選項從名單長出來，不是寫死的清單。寫死的話 team 不在清單裡的人
// （舊資料、打錯字、之後新增的組）會整個從畫面上消失，而看不到的人不會被催。
test("★ 篩選的選項是從名單長出來的，沒填 team 的不會變成一個選項", () => {
  assert.deepEqual(teamsOf(T), ["Curriculum Team", "Sponsorship Team"]);
  assert.deepEqual(teamsOf([]), []);
  assert.deepEqual(teamsOf(null), []);
});

test("★ 前後空白不會變成第二個選項", () => {
  assert.equal(teamsOf(T).filter(t => t === "Curriculum Team").length, 1);
  assert.equal(filterByTeam(T, "Curriculum Team").length, 2, "前後有空白的那個人被篩掉了");
});

test("篩選：空字串是全部；沒填 team 的人不屬於任何一個 team", () => {
  assert.equal(filterByTeam(T, "").length, 4);
  assert.equal(filterByTeam(T, "Sponsorship Team").map(m => m.id).join(""), "b");
});

// ⚠ 一片空白看起來是壞掉，不是「這個 team 沒有人」。
test("★ 篩到一個人都沒有時回全部，不是回空的", () => {
  assert.equal(filterByTeam(T, "Ghost Team").length, 4);
});

test("★ 只有一個 team 的時候不畫那排按鈕", () => {
  assert.equal(teamFilterHTML({ allTeams: ["Curriculum Team"], team: "" }), "");
  assert.equal(teamFilterHTML({ allTeams: [], team: "" }), "");
  const h = teamFilterHTML({ allTeams: ["Curriculum Team", "Sponsorship Team"], team: "" });
  assert.match(h, /全部/);
  assert.match(h, /data-team="Curriculum Team"/);
  assert.match(h, />Curriculum</, "按鈕上不用再寫一次 Team");
});

test("選起來的那一顆有標記，「全部」在沒選的時候是選起來的", () => {
  const all = teamFilterHTML({ allTeams: ["A Team", "B Team"], team: "" });
  assert.match(all, /class="chip on" data-act="team" data-team=""/);
  const one = teamFilterHTML({ allTeams: ["A Team", "B Team"], team: "B Team" });
  assert.match(one, /class="chip on" data-act="team" data-team="B Team"/);
  assert.doesNotMatch(one, /class="chip on" data-act="team" data-team=""/);
});

test("team 的名字會跳脫", () => {
  const h = teamFilterHTML({ allTeams: ['<img src=x>', "B Team"], team: "" });
  assert.ok(!h.includes("<img src=x"));
  assert.match(h, /&lt;img/);
});

// 一個人可以在好幾個 team（Paul 2026-09-10）。
const MULTI = [
  { id: "m", name: "多", alt: "", team: "Curriculum Team, Marketing Team", tz: "Asia/Taipei", updatedAt: null },
  { id: "s", name: "單", alt: "", team: "Marketing Team", tz: "Asia/Taipei", updatedAt: null },
];
test("★ 在兩個 team 的人，兩個 team 的選項都有，篩哪一邊都找得到他", () => {
  assert.deepEqual(teamsOf(MULTI), ["Curriculum Team", "Marketing Team"]);
  assert.deepEqual(filterByTeam(MULTI, "Curriculum Team").map(m => m.id), ["m"]);
  assert.deepEqual(filterByTeam(MULTI, "Marketing Team").map(m => m.id), ["m", "s"]);
});

test("★ 會議信預覽：議程或會議紀錄沒填，那一行整行拿掉（跟資料庫 meeting_fill 同一套）", async () => {
  const S = await import("../admin/site/src/ui.js");
  const tpl = "議程：{agenda}\n會議紀錄：{doc}\n\n{link}";
  assert.equal(S.fillMeeting(tpl, { agenda: "", doc: " ", link: "L" }), "\nL");
  assert.equal(S.fillMeeting(tpl, { agenda: "海報", doc: "", link: "L" }), "議程：海報\n\nL");
  assert.equal(S.fillMeeting(tpl, { agenda: "海報", doc: "D", link: "L" }), "議程：海報\n會議紀錄：D\n\nL");
  const sql = (await import("node:fs")).readFileSync("supabase/migrations/2026-11-25-meeting-mail-empty-lines.sql", "utf8");
  assert.match(sql, /\[\^\\n\]\*\\\{doc\\\}\[\^\\n\]\*\\n\?/);
});
