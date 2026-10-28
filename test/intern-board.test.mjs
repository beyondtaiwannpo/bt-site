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
    assert.match(readFileSync(f, "utf8"), /key: "board",\s+sec: "pass",\s+label: \{ zh: "實習的蛇梯棋"/, f);
  }
  const d = readFileSync("admin/passports/src/data.js", "utf8");
  assert.match(d, /rpc\("save_board"/);
  assert.match(d, /rpc\("set_board_active"/);
  assert.doesNotMatch(d, /intern_moves|intern_entries/, "後台不讀擲骰流水，更不讀心得");
});

// ── intern 看到的棋盤（intern-passport/） ────────────────────────────
import * as IN from "../intern-passport/src/ui.js";
IN.setLang("zh");
const ITASKS = [
  { id: "T2627-01", category: "onboard", seq: 1, title_zh: "認識 BT", title_en: "MEET BT", description: "" },
  { id: "T2627-02", category: "project", seq: 2, title_zh: "第一個任務", title_en: "FIRST TASK", description: "" },
  { id: "T2627-06", category: "project", seq: 6, title_zh: "期末成果", title_en: "FINAL", description: "" },
];
const SQ = [{ pos: 2, kind: "task", task_id: "T2627-01" }, { pos: 4, kind: "ladder", goes_to: 14 }, { pos: 7, kind: "task", task_id: "T2627-02" },
  { pos: 16, kind: "snake", goes_to: 6 }, { pos: 30, kind: "task", task_id: "T2627-06" }];
const ME = { id: "u1", name_zh: "實習一號", name_en: "Amy", avatar: null, term: "2026-27" };
const IS = extra => ({ profile: ME, tasks: ITASKS, stamps: { "T2627-01": { date: "2026-10-01" } }, entries: {}, term: { id: "2026-27", title_zh: "2026-27 實習", title_en: "INTERNSHIP 2026-27" },
  page: 0, view: "passport", flipped: {}, staff: false, wall: [{ id: "u2", name_zh: "實習二號", name_en: "Bob", avatar: null, intern_stamps: [] }],
  board: { term: "2026-27", size: 30, active: true }, squares: SQ,
  positions: [{ user_id: "u1", pos: 9, rolls: 2, tickets: 1 }, { user_id: "u2", pos: 14, rolls: 3, tickets: 0 }],
  lastRoll: null, rolling: false, animPos: null, ...extra });

test("★ 兩邊的 boardRows 逐字一樣（intern 看到的排法跟後台排的一樣）", () => {
  assert.equal(String(IN.boardRows), String(PA.boardRows));
  assert.equal(IN.BOARD_PER_ROW, PA.BOARD_PER_ROW);
});

test("棋盤開著就是第一頁；沒開就沒有這一頁", () => {
  assert.equal(IN.pagesOf(IS())[0].kind, "board");
  assert.equal(IN.pagesOf(IS({ board: null }))[0].kind, "id");
});

test("棋盤頁：我在第 9 格、1 張票、擲得了；別人的棋子也在；任務格點得開；蓋過的劃掉", () => {
  const h = IN.boardPageHTML(IS());
  assert.match(h, /你在第 9 格/);
  assert.match(h, /1 張票/);
  assert.match(h, /<button class="btn" data-act="roll">擲骰子/);
  assert.match(h, /data-pos="9"[\s\S]*?class="pawn me"[^>]*>實/);
  assert.match(h, /data-pos="14"[\s\S]*?class="pawn"[^>]*>實/);
  assert.match(h, /class="bq task[^"]*stamped" data-pos="2" data-act="open" data-id="T2627-01"/);
  assert.match(h, /class="st done">認識 BT/);
  assert.match(h, /data-pos="4"[\s\S]*?↑14/);
  assert.match(h, /data-pos="16"[\s\S]*?↓6/);
  assert.match(h, /data-pos="30"[^>]*>\s*<span class="bn">終點/);
  assert.equal((h.match(/data-pos="/g) || []).length, 30);
});

test("沒票就按不了而且講為什麼；到終點說到了；差一格說差哪一格", () => {
  const none = IN.boardPageHTML(IS({ positions: [{ user_id: "u1", pos: 9, rolls: 3, tickets: 0 }] }));
  assert.match(none, /data-act="roll" disabled>蓋一個章就有票/);
  const done = IN.boardPageHTML(IS({ positions: [{ user_id: "u1", pos: 30, rolls: 9, tickets: 2 }] }));
  assert.match(done, /data-act="roll" disabled>到終點了/);
  const wait = IN.boardPageHTML(IS({ positions: [{ user_id: "u1", pos: 29, rolls: 9, tickets: 2 }] }));
  assert.match(wait, /差一格：蓋了「期末成果」就到終點/);
});

test("擲完那一行：擲到幾、爬梯子或滑蛇、落在沒做的任務格就推薦", () => {
  const S = IS({ lastRoll: { rolled: 3, landed: 4, to_pos: 14, kind: "ladder", goes_to: 14, tickets_left: 0, finished: false } });
  assert.match(IN.rollResultHTML(S), /擲到 <b>3<\/b>，落在第 4 格，爬梯子到第 14 格/);
  const S2 = IS({ lastRoll: { rolled: 2, landed: 7, to_pos: 7, kind: "task", goes_to: null, tickets_left: 0, finished: false } });
  const h = IN.rollResultHTML(S2);
  assert.match(h, /推薦下一個做「第一個任務」/);
  assert.match(h, /data-act="open" data-id="T2627-02"/);
  const S3 = IS({ lastRoll: { rolled: 5, landed: 16, to_pos: 6, kind: "snake", goes_to: 6 } });
  assert.match(IN.rollResultHTML(S3), /滑蛇到第 6 格/);
  // 棋子正在走：畫面上的位置是 animPos，不是資料庫的。
  assert.match(IN.boardPageHTML(IS({ animPos: 11 })), /data-pos="11"[\s\S]*?class="pawn me"/);
  // 骰子在轉：按鈕鎖住。
  assert.match(IN.boardPageHTML(IS({ rolling: true })), /data-act="roll" disabled>擲骰中/);
});

test("樣書上沒有我的棋子、任務格點不開、按鈕是關的", () => {
  const h = IN.boardPageHTML(IS({ sample: true, profile: IN.sampleProfile({ id: "2026-27" }), stamps: {} }));
  assert.doesNotMatch(h, /pawn me/);
  assert.doesNotMatch(h, /data-act="open"/);
  assert.match(h, /data-act="roll" disabled/);
  assert.match(h, /樣書的棋盤/);
});

test("進度牆：棋盤開著就先畫大家的棋子與名次，位置在前章數在後", () => {
  const S = IS({ wall: [{ id: "u1", name_zh: "實習一號", avatar: null, intern_stamps: [{ task_id: "T2627-01" }] }, { id: "u2", name_zh: "實習二號", avatar: null, intern_stamps: [] }] });
  const h = IN.wallHTML(S);
  assert.match(h, /大家在哪一格/);
  assert.match(h, /<ol class="wrank"><li><span class="pawn"[^>]*>實<\/span><div><b>實習二號<\/b><span>第 14 格・0 \/ 3<\/span><\/div><\/li><li><span class="pawn me"[^>]*>實<\/span><div><b>實習一號<\/b><span>第 9 格・1 \/ 3/);
  assert.match(h, /誰是哪一顆/);
  assert.doesNotMatch(IN.wallHTML(IS({ board: null, wall: S.wall })), /大家在哪一格/);
});

test("★ 英文畫出來不剩中文（棋盤頁、擲完那一行、牆）", () => {
  IN.setLang("en");
  const base = { profile: { ...ME, name_zh: "" }, tasks: ITASKS.map(t => ({ ...t, title_zh: "" })), term: { id: "2026-27", title_zh: "", title_en: "X" },
    wall: [{ id: "u2", name_zh: "", name_en: "Bob", avatar: null, intern_stamps: [] }] };
  const h = IN.boardPageHTML(IS(base)) + IN.rollResultHTML(IS({ ...base, lastRoll: { rolled: 2, landed: 7, to_pos: 7, kind: "task" } }))
    + IN.wallHTML(IS(base)) + IN.boardPageHTML(IS({ ...base, sample: true, profile: IN.sampleProfile({ id: "2026-27" }) })) + IN.pagesOf(IS(base)).map(p => p.label).join(",");
  IN.setLang("zh");
  assert.doesNotMatch(h, /[一-鿿]/);
});

test("★ intern 的資料層：骰子走 rpc 不碰表、位置走 rpc、不讀 entries 以外的新表", () => {
  const d = readFileSync("intern-passport/src/data.js", "utf8");
  assert.match(d, /rpc\("roll_dice"\)/);
  assert.match(d, /rpc\("intern_positions"\)/);
  assert.doesNotMatch(d, /from\("intern_moves"\)/, "流水只在資料庫，前端不直接讀");
});


// ── 棋子與畫出來的蛇梯（2026-10-23，批 5） ──────────────────────────
test("★ 八顆棋子，代號跟遷移檔的 check 一樣；每顆都是自己畫的向量、只用色票的 var()", () => {
  assert.deepEqual(IN.PAWN_KEYS, ["meeple", "checker", "cat", "bird", "fish", "star", "boat", "kite"]);
  const sql = readFileSync("supabase/migrations/2026-10-23-intern-pawn.sql", "utf8");
  for (const k of IN.PAWN_KEYS) assert.ok(sql.includes(`'${k}'`), `遷移檔的 check 少了 ${k}`);
  for (const k of IN.PAWN_KEYS) {
    const h = IN.pawnHTML({ pawn: k, name: "Amy", me: false });
    assert.match(h, /^<svg class="pawn" viewBox="0 0 24 24"/);
    assert.doesNotMatch(h, /#[0-9a-fA-F]{3,6}\b|<img|http/, "棋子不准寫死色碼、不准外部圖");
    assert.match(h, /var\(--bt-/);
  }
});

test("棋子：有代號畫向量、沒有就大頭照、再沒有就名字第一個字；自己的多 me", () => {
  assert.match(IN.pawnHTML({ pawn: "cat", name: "Amy", me: true }), /class="pawn me"/);
  assert.match(IN.pawnHTML({ pawn: null, avatar: "data:x", name: "Amy" }), /<img class="pawn" src="data:x"/);
  assert.match(IN.pawnHTML({ pawn: "nope", name: "實習" }), /<span class="pawn"[^>]*>實<\/span>/);
});

test("選棋子：資料頁有（現在的那一顆亮著），第一次上棋盤沒選就先問，選了或先跳過就不問", () => {
  const h = IN.idPageHTML(IS({ profile: { ...ME, pawn: "bird" } }));
  assert.match(h, /id="pawn-picker"/);
  assert.match(h, /class="ppbtn on" data-act="pawn" data-key="bird"/);
  assert.equal((h.match(/data-act="pawn"/g) || []).length, 9, "八顆加大頭照");
  assert.doesNotMatch(IN.idPageHTML(IS({ board: null })), /pawn-picker/, "棋盤沒開就不用選棋子");
  const first = IN.boardPageHTML(IS());
  assert.match(first, /class="ppick first"/);
  assert.match(first, /data-act="pawn-skip"/);
  assert.doesNotMatch(IN.boardPageHTML(IS({ profile: { ...ME, pawn: "cat" } })), /ppick/);
  assert.doesNotMatch(IN.boardPageHTML(IS({ pawnSkipped: true })), /ppick/);
  assert.doesNotMatch(IN.boardPageHTML(IS({ sample: true, profile: IN.sampleProfile({ id: "2026-27" }) })), /ppick/);
});

test("★ 畫出來的蛇與梯：梯子兩條軌加橫檔，蛇一條彎線加頭；每條有 id 給棋子沿著走；顏色只用 var()", () => {
  const centers = {}; for (let p = 1; p <= 30; p++) { const r = Math.floor((p - 1) / 5), c = (p - 1) % 5; centers[p] = { x: (r % 2 ? 4 - c : c) * 100 + 50, y: (5 - r) * 100 + 50 }; }
  const svg = IN.boardLinesSVG(SQ, centers, 100);
  assert.match(svg, /<g class="ladder" data-from="4" data-to="14">/);
  assert.match(svg, /id="line-4"/);
  assert.match(svg, /<g class="snake" data-from="16" data-to="6">/);
  assert.match(svg, /id="line-16" d="M[^"]*C[^"]*S/);
  assert.equal((svg.match(/<circle/g) || []).length, 3, "蛇頭一個圓加兩隻眼睛");
  assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,6}\b/);
  assert.match(svg, /stroke:var\(--bt-orange\)/);
  assert.match(svg, /stroke:var\(--bt-teal\)/);
  assert.equal(IN.boardLinesSVG(SQ, {}, 100), "", "格子還沒量到就什麼都不畫");
});

test("棋盤格子裡有 svg 容器；飛行中格子裡不畫我；牆上的棋子帶代號", () => {
  const h = IN.boardPageHTML(IS({ profile: { ...ME, pawn: "cat" }, positions: [{ user_id: "u1", pos: 9, rolls: 2, tickets: 1, pawn: "cat" }, { user_id: "u2", pos: 14, rolls: 3, tickets: 0, pawn: "boat" }] }));
  assert.match(h, /<svg class="blines" aria-hidden="true"><\/svg>/);
  assert.match(h, /data-pos="9"[\s\S]*?<svg class="pawn me"/);
  assert.match(h, /data-pos="14"[\s\S]*?<svg class="pawn" viewBox/);
  assert.doesNotMatch(IN.boardPageHTML(IS({ profile: { ...ME, pawn: "cat" }, flying: true })), /pawn me/);
});

test("★ 英文畫出來不剩中文（選棋子、牆的圖例）", () => {
  IN.setLang("en");
  const h = IN.pawnPickerHTML("cat", false) + IN.pawnPickerHTML(null, true)
    + IN.wallHTML(IS({ profile: { ...ME, name_zh: "" }, tasks: ITASKS.map(t => ({ ...t, title_zh: "" })), wall: [{ id: "u2", name_zh: "", name_en: "Bob", avatar: null, intern_stamps: [] }] }));
  IN.setLang("zh");
  assert.doesNotMatch(h, /[\u4e00-\u9fff]/);
});

// ── 上色（2026-10-24，Paul：「要彩色」）────────────────────────────────────────
test("★ 上色：任務格照分類上色、後面的空格淡淡的同色到下一個任務格、蛇梯格保留；我在的那一格發光；圖例多三個分類", () => {
  const S = IS({ profile: { ...ME, pawn: "cat" }, positions: [{ user_id: "u1", pos: 9, rolls: 2, tickets: 1, pawn: "cat" }] });
  const h = IN.boardPageHTML(S);
  assert.match(h, /class="bq task c-onboard[^"]*" data-pos="2"/, "任務格帶它的分類");
  assert.match(h, /class="bq plain z-onboard[^"]*" data-pos="3"/, "任務格後面的空格淡淡的同一色");
  assert.match(h, /class="bq ladder[^"]*" data-pos="4"/, "梯子格不上分類色");
  assert.doesNotMatch(h, /class="bq ladder z-/);
  assert.match(h, /class="bq plain" data-pos="1"/, "第一個任務格之前沒有分區");
  assert.match(h, /class="bq plain z-project here" data-pos="9"/, "我在第 9 格（第 7 格的任務是 project，往後都淡藍）：here");
  assert.equal((h.match(/ here"/g) || []).length, 1, "只有一格發光");
  assert.match(h, /<div class="blegend"><span class="c-onboard">/);
  assert.doesNotMatch(IN.boardPageHTML(IS({ sample: true, profile: IN.sampleProfile({ id: "2026-27" }) })), / here"/, "樣書上沒有我，不發光");
});

test("★ 八顆棋子八個不一樣的顏色，三個調出來的是 color-mix 七色（index.html 的 --pawn-*），沒有新色碼", () => {
  const colors = Object.values(IN.PAWN_COLORS);
  assert.equal(new Set(colors).size, 8, "八個顏色不重複");
  const html = readFileSync("intern-passport/index.html", "utf8");
  for (const v of ["deepteal", "rust", "lime"]) assert.match(html, new RegExp(`--pawn-${v}:color-mix\\(in srgb,var\\(--bt-[a-z]+\\) \\d+%,var\\(--bt-[a-z]+\\)\\)`), `--pawn-${v} 要從七色調`);
  for (const k of IN.PAWN_KEYS) {
    const fill = IN.PAWNS[k].color, want = IN.PAWN_COLORS[k];
    assert.ok(IN.pawnHTML({ pawn: k, name: "x" }).includes(`fill:${fill}`), `${k} 的主色要真的畫在棋子上`);
    assert.ok(fill === `var(--bt-${want})` || fill === `var(--pawn-${want})`, `${k} 的填色 ${fill} 要是 ${want}`);
  }
});

test("★ 梯子有紋路、蛇有脊與舌頭（舌頭是橘的，七色裡沒有紅）；還是只用 var()", () => {
  const centers = {}; for (let p = 1; p <= 30; p++) { const r = Math.floor((p - 1) / 5), c = (p - 1) % 5; centers[p] = { x: (r % 2 ? 4 - c : c) * 100 + 50, y: (5 - r) * 100 + 50 }; }
  const svg = IN.boardLinesSVG(SQ, centers, 100);
  assert.match(svg, /<path class="grain"[^>]*stroke:var\(--bt-cream\)[^>]*stroke-dasharray/);
  assert.match(svg, /<path class="spine"[^>]*stroke:var\(--bt-navy\)[^>]*stroke-opacity:\.45/);
  assert.match(svg, /<path class="tongue"[^>]*stroke:var\(--bt-orange\)/);
  assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,6}\b|red/);
  assert.equal((svg.match(/<circle/g) || []).length, 3, "蛇頭一個圓加兩隻眼睛，舌頭是 path 不是圓");
});

// 對比度不用眼睛看：從 index.html 把每一種格子底的 rgba 讀出來，疊在白 .5 疊在紙上，算深藍標題與 .75 的格號。
test("★ 格子上的字對比度：深藍標題 >= 4.5:1、格號 >= 4.5:1，每一種底色都算", () => {
  const html = readFileSync("intern-passport/index.html", "utf8");
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
  const lum = rgb => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = rgb.map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
  const PAPER = hex("#EDE5D8"), NAVY = hex("#102A86"), WHITE = [255, 255, 255];
  const base = over(WHITE, 0.5, PAPER);
  const bnAlpha = Number(html.match(/\.bq \.bn\{[^}]*color:rgba\(16,42,134,(\.\d+)\)/)[1]);
  const sels = [".bq.task", ".bq.z-onboard", ".bq.z-project", ".bq.z-reflect", ".bq.task.c-onboard", ".bq.task.c-project", ".bq.task.c-reflect", ".bq.ladder", ".bq.snake", ".bq.lit"];
  const out = {};
  for (const sel of sels) {
    const m = html.match(new RegExp(sel.replace(/\./g, "\\.") + "\\{[^}]*background:rgba\\((\\d+),(\\d+),(\\d+),(\\.\\d+|\\d\\.?\\d*)\\)"));
    assert.ok(m, `${sel} 要有 rgba 底色`);
    const bg = over([+m[1], +m[2], +m[3]], +m[4], base);
    const title = ratio(NAVY, bg), num = ratio(over(NAVY, bnAlpha, bg), bg);
    out[sel] = { title: +title.toFixed(2), num: +num.toFixed(2) };
    assert.ok(title >= 4.5, `${sel} 標題 ${title.toFixed(2)}:1 不到 4.5`);
    assert.ok(num >= 4.5, `${sel} 格號 ${num.toFixed(2)}:1 不到 4.5`);
  }
  assert.ok(bnAlpha >= 0.75, "格號的 alpha 至少 .75（.6 時三種底都不到 4.5）");
});
