// 實習護照的蛇梯棋（2026-10-22，docs/2026-10-19-實習護照蛇梯棋計畫.md）。
// 後台排棋盤的純函式與畫面。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as PA from "../admin/passports/src/ui.js";
import { readFileSync } from "node:fs";

PA.setLang("zh");
const TERM = { id: "2026-27", title_zh: "2026-27 實習", title_en: "INTERNSHIP 2026-27", active: true };
const TASKS = [
  { id: "T2627-01", term: "2026-27", category: "onboard", title_zh: "認識 BT", title_en: "MEET BT", active: true },
  { id: "T2627-06", term: "2026-27", category: "project", title_zh: "期末成果", title_en: "FINAL", active: true },
];
const DRAFT = { size: 30, dirty: false, squares: {
  2: { kind: "task", task_id: "T2627-01" }, 4: { kind: "ladder", goes_to: 14 }, 16: { kind: "snake", goes_to: 6 },
  30: { kind: "task", task_id: "T2627-06" } } };

test("★ 蛇形排法：第一排在最下面左到右，第二排右到左", () => {
  const rows = PA.boardRows(10, 5);
  assert.deepEqual(rows, [[10, 9, 8, 7, 6], [1, 2, 3, 4, 5]]);
  const r30 = PA.boardRows(30, 5);
  assert.equal(r30.length, 6);
  assert.deepEqual(r30[5], [1, 2, 3, 4, 5]);
  assert.deepEqual(r30[0], [30, 29, 28, 27, 26], "第六排是偶數排，右到左，終點在左上");
  assert.deepEqual(PA.boardRows(12, 5)[0], [11, 12], "第三排又是左到右");
});

test("squaresToList：空格不送、照格號排、梯蛇只帶 goes_to、任務格只帶 task_id", () => {
  const list = PA.squaresToList({ squares: { 9: { kind: "snake", goes_to: 3, task_id: "x" }, 2: { kind: "task", task_id: "T2627-01", goes_to: 5 }, 5: { kind: "plain" } } });
  assert.deepEqual(list, [
    { pos: 2, kind: "task", task_id: "T2627-01", goes_to: null },
    { pos: 9, kind: "snake", task_id: null, goes_to: 3 },
  ]);
});

test("★ 畫面上先擋一次：梯子往下、蛇往上、通到的格子超出、任務格沒綁", () => {
  assert.equal(PA.squareProblem(4, { kind: "ladder", goes_to: 14 }, 30), null);
  assert.equal(PA.squareProblem(4, { kind: "ladder", goes_to: 2 }, 30), "err.ladderUp");
  assert.equal(PA.squareProblem(16, { kind: "snake", goes_to: 20 }, 30), "err.snakeDown");
  assert.equal(PA.squareProblem(16, { kind: "snake", goes_to: 0 }, 30), "err.goesRange");
  assert.equal(PA.squareProblem(16, { kind: "ladder", goes_to: 31 }, 30), "err.goesRange");
  assert.equal(PA.squareProblem(2, { kind: "task" }, 30), "err.needTask");
  assert.equal(PA.squareProblem(2, { kind: "plain" }, 30), null);
});

test("棋盤畫面：30 格、梯子寫 ↑14、蛇寫 ↓6、任務格寫格子的名字、最後一格標終點", () => {
  const h = PA.boardAdminHTML(TERM, TASKS, { term: "2026-27", size: 30, active: false }, DRAFT, null, "", false);
  assert.equal((h.match(/data-act="board-pick"/g) || []).length, 30);
  assert.match(h, /class="bsq ladder"[^>]*data-pos="4"[\s\S]*?↑ 14/);
  assert.match(h, /class="bsq snake"[^>]*data-pos="16"[\s\S]*?↓ 6/);
  assert.match(h, /class="bsq task"[^>]*data-pos="2"[\s\S]*?認識 BT/);
  assert.match(h, /class="bsq task finish"[^>]*data-pos="30"/);
  assert.match(h, /1 道梯、1 條蛇、2 個任務格/);
  assert.match(h, /data-act="board-toggle" data-on="1"/);
  assert.match(h, /data-act="board-save"/);
  assert.match(h, /點上面任何一格來改它/);
});

test("點了一格出現編輯區；棋盤開著的時候蛇梯鎖住、格數鎖住", () => {
  const h = PA.boardAdminHTML(TERM, TASKS, { term: "2026-27", size: 30, active: true }, DRAFT, 4, "", false);
  assert.match(h, /id="board-edit"/);
  assert.match(h, /第 4 格/);
  assert.match(h, /id="bq-kind" disabled/, "開著的時候梯子那一格的種類不能改");
  assert.match(h, /id="bd-size" disabled/);
  assert.match(h, /class="bsq snake off"/);
  assert.match(h, /data-act="board-toggle" data-on="0"/);
  const p = PA.boardAdminHTML(TERM, TASKS, { term: "2026-27", size: 30, active: true }, DRAFT, 7, "", false);
  assert.doesNotMatch(p, /id="bq-kind" disabled/, "空格還是改得動");
});

test("沒有屆別就說先開一屆；draft 有改動標出來", () => {
  assert.match(PA.boardAdminHTML(null, [], null, null, null, "", false), /還沒開這一屆/);
  assert.match(PA.boardAdminHTML(TERM, TASKS, null, { ...DRAFT, dirty: true }, null, "", false), /有還沒存的改動/);
});

test("★ 英文畫出來不剩中文", () => {
  PA.setLang("en");
  const h = PA.boardAdminHTML(TERM, [{ ...TASKS[0], title_zh: "" }, { ...TASKS[1], title_zh: "" }], { term: "2026-27", size: 30, active: false }, DRAFT, 4, "", false)
    + PA.boardAdminHTML(null, [], null, null, null, "", false);
  PA.setLang("zh");
  assert.doesNotMatch(h.replace(/2026-27 實習/g, ""), /[一-鿿]/);
});

test("★ 側欄四份都有「棋盤」，而且資料層只讀 intern_boards 與 intern_squares、不碰 entries", () => {
  for (const f of ["admin/src/ui.js", "admin/site/src/ui.js", "admin/passports/src/ui.js", "admin/people/src/ui.js"]) {
    assert.match(readFileSync(f, "utf8"), /key: "board",\s+label: \{ zh: "棋盤"/, f);
  }
  const d = readFileSync("admin/passports/src/data.js", "utf8");
  assert.match(d, /rpc\("save_board"/);
  assert.match(d, /rpc\("set_board_active"/);
  assert.doesNotMatch(d, /intern_moves|intern_entries/, "後台不讀擲骰流水，更不讀心得");
});
