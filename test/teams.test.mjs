// 六個 team 這份清單散在三個地方，這個檔案守住它們講的是同一件事。
//
// 為什麼不做成一份共用檔案：shared/ 要保持極小是這個 repo 的北極星之一
// （見 GOALS.md「不做路由器、外掛系統」），而在 shared/ 加新檔案要先問 Paul。
// 所以三份各自存在，**用測試當接縫**：漂移的表現是
// 「同一個人在兩個地方屬於不同的 team」，不會報錯，只會讓篩選漏掉他。
import { test } from "node:test";
import assert from "node:assert/strict";
import { TEAMS as PASSPORT_TEAMS } from "../passport/src/ui.js";
import { TEAMS as SETTINGS_TEAMS, teamPickHTML } from "../settings/src/ui.js";
import { TEAM_ORDER, teamKey } from "../team/src/ui.js";

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

// ⚠ 換成選單之後最容易寫出來的 bug：本來就存在、但不在清單裡的值
// 被悄悄換成清單的第一個。那個人不會發現，因為畫面上顯示的本來就是那一個。
test("★ 本來填的 team 不在清單裡時，原樣留著當一個選項", () => {
  const h = teamPickHTML("President's Office");
  assert.ok(h.includes("President&#39;s Office"), "原本填的值不見了");
  assert.match(h, /President&#39;s Office（原本填的）<\/option>/);
  assert.match(h, /value="President&#39;s Office" selected/);
});

test("清單裡的值會被選起來；沒填過的人停在「還沒選」", () => {
  assert.match(teamPickHTML("Marketing Team"), /<option selected>Marketing Team<\/option>/);
  assert.match(teamPickHTML(""), /<option value="" selected>還沒選<\/option>/);
  assert.match(teamPickHTML(null), /<option value="" selected>還沒選<\/option>/);
});
