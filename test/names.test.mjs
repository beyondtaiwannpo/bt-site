// 「一個人顯示哪兩個名字」這條規則在三個資料夾各有一份。
//
// 為什麼不做成一份共用檔案：資料夾之間不互相 import 是這個 repo 的依賴規矩
// （每個資料夾連 esc() 都各有一份），而在 shared/ 加新檔案要先問 Paul（GOALS.md）。
// 所以三份各自存在，**用這個檔案當接縫**：漂移的表現是
// 「同一個人在時間看板、進度牆、申請管理上顯示的名字不一樣」，不會報錯。
import { test } from "node:test";
import assert from "node:assert/strict";
import { namesOf as fromAvailability } from "../availability/src/data.js";
import { namesOf as fromPassport } from "../passport/src/ui.js";
import { namesOf as fromAdmin } from "../admin/src/ui.js";

const IMPL = [["availability", fromAvailability], ["passport", fromPassport], ["admin", fromAdmin]];

// 每一種寫錯的表現都是「名單上少一個人」或「同一個名字印兩次」，不會報錯。
const CASES = [
  [{ name_zh: "林育安", name_en: "Yu-An Lin" }, { name: "林育安", alt: "Yu-An Lin" }],
  [{ name_zh: "只有中文", name_en: "" },        { name: "只有中文", alt: "" }],
  [{ name_zh: null, name_en: "Only English" },  { name: "Only English", alt: "" }],
  [{ name_zh: "Paul", name_en: "Paul" },        { name: "Paul", alt: "" }],
  [{ name_zh: "  Paul ", name_en: "Paul" },     { name: "Paul", alt: "" }],
  [{ name_zh: "   ", name_en: "Lin" },          { name: "Lin", alt: "" }],
  [{},                                          { name: "（沒有名字）", alt: "" }],
];

for (const [label, fn] of IMPL) {
  test(`★ ${label} 的 namesOf 跟其他兩份講一樣的話`, () => {
    for (const [input, want] of CASES) {
      assert.deepEqual(fn(input), want, `${label}：${JSON.stringify(input)}`);
    }
  });
}
