// 六個 team 這份清單散在三個地方，這個檔案守住它們講的是同一件事。
//
// 為什麼不做成一份共用檔案：shared/ 要保持極小是這個 repo 的北極星之一
// （見 GOALS.md「不做路由器、外掛系統」），而在 shared/ 加新檔案要先問 Paul。
// 所以三份各自存在，**用測試當接縫**：漂移的表現是
// 「同一個人在兩個地方屬於不同的 team」，不會報錯，只會讓篩選漏掉他。
import { test } from "node:test";
import assert from "node:assert/strict";
import { TEAMS as PASSPORT_TEAMS } from "../passport/src/ui.js";
import { TEAMS as SETTINGS_TEAMS, teamPickHTML, formatTeams,
         parseTeams as settingsParse } from "../settings/src/ui.js";
import { TEAM_ORDER, teamKey, parseTeams as teamParse } from "../team/src/ui.js";
import { parseTeams as avParse } from "../availability/src/ui.js";

test("★ 護照與設定頁的 team 清單逐字一樣", () => {
  assert.deepEqual(SETTINGS_TEAMS, PASSPORT_TEAMS,
    "兩份清單漂移了 —— 同一個人在兩個地方會屬於不同的 team");
});

// /team/ 那一頁用縮寫（Sponsorship / CR），profiles 裡存的是全名
// （Sponsorship Team / Community Relations Team）。teamKey 是那座橋。
test("★ 每一個正式的 team 名字在對外團隊頁上都分得到組，沒有一個掉到最後面", () => {
  for (const t of PASSPORT_TEAMS) {
    const k = teamKey(t);
    assert.ok(TEAM_ORDER.includes(k),
      `「${t}」分到的是「${k}」，不在 TEAM_ORDER 裡 —— 這一組的人會掉到「還有這些人」`);
  }
});

test("★ Community Relations Team 要對到 CR，不是自成一組", () => {
  assert.equal(teamKey("Community Relations Team"), "CR");
  assert.equal(teamKey("community relations"), "CR");
  assert.equal(teamKey("Community Relations"), "CR");
});

// ⚠ 換成勾選之後最容易寫出來的 bug：本來就存在、但不在清單裡的值消失了。
// 那個人不會發現 —— 畫面上本來就沒有那一格。
test("★ 本來填的 team 不在清單裡時，原樣留著而且是勾起來的", () => {
  const h = teamPickHTML("President's Office");
  assert.match(h, /value="President&#39;s Office" checked/, "原本填的值不見了");
  assert.match(h, /President&#39;s Office（原本填的）/);
});

test("清單裡的值會被勾起來，沒填過的人一個都沒勾", () => {
  const on = teamPickHTML("Marketing Team");
  assert.match(on, /value="Marketing Team" checked/);
  assert.doesNotMatch(on, /value="Curriculum Team" checked/);
  assert.doesNotMatch(teamPickHTML(""), /checked/);
  assert.doesNotMatch(teamPickHTML(null), /checked/);
});

// ── 一個人可以在好幾個 team（Paul 2026-09-10）──────────────────────
test("★ 好幾個 team 的人，每一個都勾起來", () => {
  const h = teamPickHTML("Curriculum Team, Marketing Team");
  assert.match(h, /value="Curriculum Team" checked/);
  assert.match(h, /value="Marketing Team" checked/);
  assert.doesNotMatch(h, /value="Mentorship Team" checked/);
});

// parseTeams 這條規則在三個資料夾各有一份，這裡拿同一張表比對。
// 漂移的表現是「同一個人在時間看板上屬於兩個 team，在對外團隊頁上只屬於一個」。
const PARSERS = [["settings", settingsParse], ["team", teamParse], ["availability", avParse]];
const PARSE_CASES = [
  ["Curriculum Team, Marketing Team", ["Curriculum Team", "Marketing Team"]],
  ["Curriculum Team,Marketing Team",  ["Curriculum Team", "Marketing Team"]],
  // 全形逗號與頓號是中文輸入法打出來的，使用者不會知道差別。
  ["A、B；C",                          ["A", "B", "C"]],
  ["  A  Team ,  , B ",               ["A Team", "B"]],
  ["A, A",                            ["A"]],
  ["",                                []],
  [null,                              []],
  [undefined,                         []],
];
for (const [label, fn] of PARSERS) {
  test(`★ ${label} 的 parseTeams 跟另外兩份講一樣的話`, () => {
    for (const [input, want] of PARSE_CASES) {
      assert.deepEqual(fn(input), want, `${label}：${JSON.stringify(input)}`);
    }
  });
}

test("★ 一個都沒勾的時候不能存成一個逗號", () => {
  assert.equal(formatTeams([]), "");
  assert.equal(formatTeams(["Curriculum Team"]), "Curriculum Team");
  assert.equal(formatTeams(["A", "", "B", "A"]), "A, B", "空的與重複的要去掉");
});
