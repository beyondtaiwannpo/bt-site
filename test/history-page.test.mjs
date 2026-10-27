// BT 歷史之路（docs/2026-11-05-BT-歷史之路計畫.md）批 2：前台 /history/ 的純函式。
// 跑法：node --test test/*.test.mjs
// 這些測試不開瀏覽器：吃一份假的 public_milestones() 回傳，看吐出來的 HTML 與算出來的數字。
import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../history/src/data.js";
import * as UI from "../history/src/ui.js";
import * as S from "../history/src/scene.js";
import { STR, t } from "../history/src/strings.js";

// 假資料：故意不照時間排，看 normalize 會不會排回去；一站有照片、其餘沒有。
const ROWS = [
  { slug: "2023-first-bootcamp", happened_on: "2023-06-01", title_zh: "第一屆探索營，超過 80 人", title_en: "First College Bootcamp, more than 80 students",
    summary_zh: "一句話", summary_en: "One line", body_zh: "第一段\n\n第二段", body_en: "Para one\n\nPara two",
    photos: [{ url: "https://x.supabase.co/storage/v1/object/public/history/m1/a.jpg", caption_zh: "營隊第一天", caption_en: "Day one" }] },
  { slug: "2020-founded", happened_on: "2020-05-01", title_zh: "成立，七個人", title_en: "Founded, seven people",
    summary_zh: "", summary_en: "", body_zh: "", body_en: "", photos: [] },
  { slug: "today", happened_on: "2026-08-01", title_zh: "接近三十位幹部", title_en: "Close to thirty organisers",
    summary_zh: "", summary_en: "", body_zh: "", body_en: "", photos: [] },
];
const STOPS = D.normalize(ROWS);

test("normalize：照日期排、算出年份、沒有 photos 也給空陣列、<script> 之類的字會被逃脫", () => {
  assert.deepEqual(STOPS.map(s => s.slug), ["2020-founded", "2023-first-bootcamp", "today"]);
  assert.deepEqual(STOPS.map(s => s.year), ["2020", "2023", "2026"]);
  assert.deepEqual(D.normalize([{ slug: "x", happened_on: "2021-01-01" }])[0].photos, []);
  assert.deepEqual(D.normalize(null), []);
  assert.deepEqual(D.normalize("not an array"), []);
  // 中文標題有「，」要切出短標題給年份帶：取第一個逗號前面
  assert.equal(D.shortTitle(STOPS[0], "zh"), "成立");
  assert.equal(D.shortTitle(STOPS[0], "en"), "Founded");
  assert.equal(D.shortTitle({ title_zh: "校友帳號超過 85 個", title_en: "" }, "zh"), "校友帳號超過 85 個");
  assert.equal(D.shortTitle({ title_zh: "", title_en: "A very long english title that goes on and on" }, "en").length <= 22, true);
});

test("代號對場景：關鍵字決定要畫哪一個小場景，認不出來就是指示牌（批 4 改成機場的詞，關鍵字不變）", () => {
  assert.equal(D.motifFor("2020-founded"), "seven");
  assert.equal(D.motifFor("2020-mentorship-begins"), "seats");
  assert.equal(D.motifFor("2021-online-fair"), "board");
  assert.equal(D.motifFor("2021-online-expo"), "board");
  assert.equal(D.motifFor("2021-campus-ambassadors"), "sign");
  assert.equal(D.motifFor("2023-first-bootcamp"), "boarding");
  assert.equal(D.motifFor("2023-summer-camp"), "boarding");
  assert.equal(D.motifFor("2025-alumni-accounts"), "tail");
  assert.equal(D.motifFor("today"), "crew", "seed 的最後一站 today 是「接近三十位幹部」，畫地勤那一組");
  assert.equal(D.motifFor("2026-cadre-thirty"), "crew");
  assert.equal(D.motifFor("2024-something-else"), "signpost");
  assert.equal(D.motifFor(""), "signpost");
  assert.equal(D.motifFor(null), "signpost");
  assert.ok(S.MOTIFS.includes("signpost"), "scene.js 一定要有預設那一個");
  for (const m of ["seven", "seats", "board", "sign", "boarding", "tail", "crew", "signpost"]) assert.ok(S.MOTIFS.includes(m), m + " 場景沒畫");
});

test("hash：每一站的網址是 #代號；帶 hash 進來找得到那一站的序號，找不到回 -1；語言黏在後面也認得", () => {
  assert.equal(D.hashFor(STOPS[1]), "#2023-first-bootcamp");
  assert.equal(D.indexFromHash("#2023-first-bootcamp", STOPS), 1);
  assert.equal(D.indexFromHash("#2023-first-bootcamp?lang=en", STOPS), 1);
  assert.equal(D.indexFromHash("#nope", STOPS), -1);
  assert.equal(D.indexFromHash("", STOPS), -1);
  assert.equal(D.indexFromHash("#", STOPS), -1);
});

test("語言：先看 ?lang=，再看 bt-lang，再看瀏覽器；都沒有就英文", () => {
  assert.equal(D.pickLang("?lang=zh", "en", "en-US"), "zh");
  assert.equal(D.pickLang("?lang=xx", "zh", "en-US"), "zh");
  assert.equal(D.pickLang("", "en", "zh-TW"), "en");
  assert.equal(D.pickLang("", null, "zh-TW"), "zh");
  assert.equal(D.pickLang("", null, "fr"), "en");
  assert.equal(D.pickLang("", "garbage", null), "en");
});

test("進度：兩位數加斜線", () => {
  assert.equal(UI.progressText(0, 7), "01 / 07");
  assert.equal(UI.progressText(6, 7), "07 / 07");
  assert.equal(UI.progressText(0, 0), "00 / 00");
  assert.equal(UI.progressText(11, 12), "12 / 12");
});

test("卡：年份、標題、「+」，是個 button，aria 有站名；中英各一份", () => {
  const zh = UI.cardHTML(STOPS[1], 1, "zh"), en = UI.cardHTML(STOPS[1], 1, "en");
  assert.match(zh, /<button[^>]*class="card[^"]*"/);
  assert.match(zh, /data-i="1"/);
  assert.match(zh, /2023/);
  assert.ok(zh.includes("第一屆探索營，超過 80 人"));
  assert.ok(en.includes("First College Bootcamp"));
  assert.ok(!en.includes("第一屆"), "英文卡不夾中文");
  assert.ok(zh.includes("打開這一站") && en.includes("Open this stop"), "讀螢幕的人要聽得到這是可以打開的");
  assert.ok(!/aria-label=/.test(zh), "不用 aria-label，名字要以看得見的字開頭");
  assert.ok(zh.includes(">+<") || zh.includes("aria-hidden=\"true\">+"), "要有加號");
});

test("年份帶：每站一顆按鈕，現在那一站 aria-current；進度文字在", () => {
  const h = UI.stripHTML(STOPS, 1, "zh");
  assert.equal((h.match(/<button/g) || []).length, 3);
  assert.equal((h.match(/aria-current="step"/g) || []).length, 1);
  assert.ok(h.includes("2020") && h.includes("2023") && h.includes("2026"));
  assert.ok(h.includes("成立") && h.includes("第一屆探索營"), "短標題要在");
  const en = UI.stripHTML(STOPS, 0, "en");
  assert.ok(en.includes("Founded") && !en.includes("成立"));
});

test("覆蓋層：日期、標題、一句話、說明分段、照片有說明與 lazy；沒有照片印「照片整理中」不印 <img>", () => {
  const zh = UI.overlayHTML(STOPS[1], "zh");
  assert.ok(zh.includes("2023"));
  assert.ok(zh.includes("第一屆探索營，超過 80 人"));
  assert.ok(zh.includes("一句話"));
  assert.ok(zh.includes("<p>第一段</p>") && zh.includes("<p>第二段</p>"), "說明要照空行分段");
  assert.match(zh, /<img[^>]*loading="lazy"/);
  assert.match(zh, /<img[^>]*alt="營隊第一天"/);
  assert.ok(zh.includes("營隊第一天"));
  assert.ok(!zh.includes("Day one"));
  const en = UI.overlayHTML(STOPS[1], "en");
  assert.ok(en.includes("Day one") && en.includes("Para two"));
  const empty = UI.overlayHTML(STOPS[0], "zh"), emptyEn = UI.overlayHTML(STOPS[0], "en");
  assert.ok(!empty.includes("<img"));
  assert.ok(empty.includes(STR.zh.noPhotos) && emptyEn.includes(STR.en.noPhotos));
  // 日期中英格式
  assert.ok(zh.includes("2023 年 6 月"), zh.slice(0, 300));
  assert.ok(en.includes("June 2023"));
  // 回到路上那顆
  assert.ok(zh.includes(STR.zh.back) && en.includes(STR.en.back));
});

test("減少動態那條：同樣的站排成直立時間軸，每站一張卡，順序一樣", () => {
  const h = UI.timelineHTML(STOPS, "zh");
  assert.equal((h.match(/class="card[" ]/g) || []).length, 3);
  assert.ok(h.indexOf("2020") < h.indexOf("2023") && h.indexOf("2023") < h.indexOf("2026"));
  assert.match(h, /<ol[^>]*class="timeline"/);
});

test("載入中與錯誤：兩種語言各一句，錯誤那句看得懂", () => {
  assert.ok(UI.loadingHTML("zh").includes("aria-busy"));
  assert.ok(UI.errorHTML("zh").includes(STR.zh.loadError));
  assert.ok(UI.errorHTML("en").includes(STR.en.loadError));
  assert.ok(UI.emptyHTML("zh").includes(STR.zh.empty));
});

test("中英字典：兩邊的鍵一模一樣，t() 缺語言退回英文", () => {
  assert.deepEqual(Object.keys(STR.zh).sort(), Object.keys(STR.en).sort());
  for (const k of Object.keys(STR.zh)) { assert.ok(STR.zh[k], "zh 的 " + k + " 是空的"); assert.ok(STR.en[k], "en 的 " + k + " 是空的"); }
  assert.equal(t("back", "zh"), STR.zh.back);
  assert.equal(t("back", "xx"), STR.en.back);
  assert.equal(t("nope", "zh"), "nope");
});

// ── 批 4：機場 ──
test("四段（批 4）：進度對段的邊界是固定比例，站不管幾個都平均分，每一站照自己落在哪一段決定畫在哪裡", () => {
  assert.deepEqual(Object.keys(S.PHASES), ["terminal", "bridge", "apron", "takeoff"]);
  assert.equal(S.phaseFor(0), "terminal"); assert.equal(S.phaseFor(0.29), "terminal");
  assert.equal(S.phaseFor(0.3), "bridge"); assert.equal(S.phaseFor(0.39), "bridge");
  assert.equal(S.phaseFor(0.4), "apron"); assert.equal(S.phaseFor(0.79), "apron");
  assert.equal(S.phaseFor(0.8), "takeoff"); assert.equal(S.phaseFor(1), "takeoff"); assert.equal(S.phaseFor(1.5), "takeoff");
  // 段與段相接，從 0 到 1
  const b = Object.values(S.PHASES); assert.equal(b[0][0], 0); assert.equal(b[3][1], 1);
  for (let i = 1; i < 4; i++) assert.equal(b[i][0], b[i - 1][1]);
  // 七站：0 .167 .333 .5 .667 .833 1
  const w = S.world(7);
  assert.deepEqual(w.stops.map(s => +s.p.toFixed(3)), [0, 0.167, 0.333, 0.5, 0.667, 0.833, 1]);
  assert.deepEqual(w.stops.map(s => s.phase), ["terminal", "terminal", "terminal", "apron", "apron", "takeoff", "takeoff"]);
  for (let i = 0; i < 7; i++) assert.equal(S.progressFor(w, i), i / 6);
  // 航廈的站沿走道往右排、停機坪的站沿滑行道往前排、起飛那一段的在跑道之後
  assert.ok(w.stops[1].x > w.stops[0].x && w.stops[2].x > w.stops[1].x);
  assert.ok(w.stops[4].z > w.stops[3].z);
  assert.ok(w.stops[5].z > w.stops[4].z && w.stops[6].z > w.stops[5].z);
  // 一站、二十五站都成立：每一站都有一段，同一段裡沒有兩站疊在同一點
  assert.equal(S.world(1).stops.length, 1); assert.equal(S.world(1).stops[0].phase, "terminal");
  assert.equal(S.world(0).stops.length, 0);
  const big = S.world(25);
  for (const s of big.stops) assert.ok(["terminal", "apron", "takeoff"].includes(s.phase), s.phase);
  const seen = new Set(); for (const s of big.stops) { const k = s.phase + ":" + (s.phase === "terminal" ? s.x : s.z); assert.ok(!seen.has(k), "兩站疊在 " + k); seen.add(k); }
  assert.ok(big.stops.filter(s => s.phase === "apron").length >= 9, "四成的捲動在停機坪，二十五站應該有九站以上在那裡");
  // 慢下來的進度：每一站的 p 對自己不變，中間單調
  for (let i = 0; i < 7; i++) assert.ok(Math.abs(S.eased(w, i / 6) - i / 6) < 1e-9);
  let last = -1; for (let p = 0; p <= 1.0001; p += 0.005) { const e = S.eased(w, p); assert.ok(e >= last - 1e-9); last = e; }
  assert.equal(S.eased(S.world(1), 0.37), 0.37, "一站的時候進度就是進度");
  assert.equal(S.nearest(w, 0.5), 3); assert.equal(S.nearest(w, 0.99), 6);
});

test("出發看板（批 4）：列是真的站，年份當時間、英文標題當目的地、狀態照走到哪；只有英文；在 HTML 不在 SVG", () => {
  const rows = UI.boardRows(STOPS, 1);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.time), ["2020", "2023", "2026"]);
  assert.equal(rows[0].dest, "FOUNDED");
  assert.equal(rows[1].dest, "FIRST COLLEGE BOOTCAMP");
  assert.deepEqual(rows.map(r => r.status), ["DEPARTED", "BOARDING", "ON TIME"]);
  assert.ok(rows.every(r => /^BT\d{2}$/.test(r.flight)), JSON.stringify(rows.map(r => r.flight)));
  assert.ok(rows.every(r => /^[A-Z]\d+$/.test(r.gate)));
  // 沒有英文標題的站退回中文（看板只有英文是慣例，但空白更糟）
  assert.equal(UI.boardRows([{ year: "2022", title_zh: "只有中文", title_en: "" }], 0)[0].dest, "只有中文");
  const h = UI.boardHTML(STOPS, 1), text = h.replace(/<[^>]+>/g, "");
  assert.ok(text.includes("FOUNDED") && text.includes("BOARDING"), text);
  assert.ok(!text.includes("成立") && !text.includes("第一屆"), "看板上不出現中文標題");
  assert.ok((h.match(/class="flip"/g) || []).length >= 12, "每一格是一片翻牌");
  assert.ok(h.includes('aria-hidden="true"'), "看板是裝飾，年份帶與卡才是給讀螢幕的人的");
  assert.equal(UI.boardHTML([], 0), "");
});

test("投影（批 4）：航廈側視的站點、停機坪的針孔投影、起飛的鏡頭抬頭；不在這一段的站不給點", () => {
  const w = S.world(7), cam = S.camera(1000, false);
  // 進度 0：第一站（航廈）在畫面裡，停機坪與起飛的站沒有點
  const p0 = S.stopPoints(w, cam, 0);
  assert.ok(p0[0] && p0[0].x > 0 && p0[0].x < 1000 && p0[0].y > 0 && p0[0].y < S.H && p0[0].near, JSON.stringify(p0[0]));
  assert.equal(p0[3], null); assert.equal(p0[6], null);
  assert.ok(!p0[2].near, "第三站還遠，卡先不浮出來");
  // 走到第二站：第二站 near、第一站不 near
  const p1 = S.stopPoints(w, cam, 1 / 6);
  assert.ok(p1[1].near && !p1[0].near);
  // 停機坪：第四站在自己的進度那一刻在畫面裡而且 near；航廈的站沒有點
  const p3 = S.stopPoints(w, cam, 0.5);
  assert.ok(p3[3] && p3[3].near && p3[3].x > 0 && p3[3].x < 1000, JSON.stringify(p3[3]));
  assert.equal(p3[0], null);
  assert.ok(p3[4] && !p3[4].near, "下一站看得到但還沒到");
  // 起飛：最後一站在進度 1 的時候在畫面裡而且 near
  const p6 = S.stopPoints(w, cam, 1);
  assert.ok(p6[6] && p6[6].near && p6[6].x > -200 && p6[6].x < 1200 && p6[6].y > 0 && p6[6].y < S.H, JSON.stringify(p6[6]));
  // 飛機：沿滑行道一路往前（Z 單調），離地之前在地上，進度 1 在空中
  let lastZ = -Infinity;
  for (let e = 0.36; e <= 1.0001; e += 0.01) { const q = S.planePose(e); assert.ok(q.z >= lastZ - 1e-9, "飛機不倒退 " + e); lastZ = q.z; }
  assert.equal(S.planePose(0.5).y, 0); assert.equal(S.planePose(0.84).y, 0);
  assert.ok(S.planePose(1).y > 300);
  assert.ok(S.planePose(0.40).x < S.planePose(0.6).x - 50, "一開始在登機門（靠航廈那一邊），推出來之後在滑行道中線");
  // 鏡頭：起飛時比在地上高、俯角比較小（抬頭）
  const ground = S.viewCam(cam, 0.6), air = S.viewCam(cam, 1);
  assert.equal(ground.h, cam.h); assert.equal(ground.pitch, cam.pitch);
  assert.ok(air.h > cam.h + 300 && air.pitch < cam.pitch - 0.1);
  assert.ok(S.horizonY(air) > S.horizonY(cam), "抬頭之後地平線在畫面上往下掉");
  // 換鏡：0.36 全室內、0.40 全室外，中間兩邊都有、單調
  const a = S.handoff(0.36), m = S.handoff(0.38), z = S.handoff(0.4);
  assert.equal(a.int, 1); assert.equal(a.ext, 0); assert.equal(z.int, 0); assert.equal(z.ext, 1);
  assert.ok(m.int > 0 && m.int < 1 && m.ext > 0 && m.ext < 1);
  assert.ok(S.handoff(0.1).int === 1 && S.handoff(0.9).ext === 1);
  // 批 3 留下來的投影本身沒變：越遠越高越小、鏡頭後面不畫
  const cz = 0, pa = S.project(cam, 0, 0, 300, cz), pb = S.project(cam, 0, 0, 900, cz);
  assert.ok(pa.y > pb.y && pa.s > pb.s); assert.equal(S.project(cam, 0, 0, -400, cz), null);
  // 直式：停機坪更陡
  const tall = S.camera(375, true);
  const t1 = S.project(tall, 0, 0, 300, 0), t2 = S.project(tall, 0, 0, 900, 0), w1 = S.project(cam, 0, 0, 300, 0), w2 = S.project(cam, 0, 0, 900, 0);
  assert.ok((t1.y - t2.y) / (t2.x - t1.x) > (w1.y - w2.y) / (w2.x - w1.x));
  // 航廈的旅客：進度 0 在起點，0.35 走到空橋盡頭，之後站著不動
  assert.equal(S.travellerX(0), 0); assert.ok(S.travellerX(0.2) > 0 && S.travellerX(0.2) < S.TERM_LEN);
  assert.equal(S.travellerX(0.35), S.TERM_LEN); assert.equal(S.travellerX(0.5), S.TERM_LEN);
});

test("場景 SVG（批 4）：室內與室外兩個世界、該有的層都在、symbol 加 use、沒有點陣圖、沒有色碼、沒有任何一站的文字、小於 70 KB；直式少畫一些", () => {
  const motifs = STOPS.map(s => D.motifFor(s.slug));
  const svg = S.sceneSVG(S.world(7), motifs, false);
  assert.ok(svg.includes('data-world="int"') && svg.includes('data-world="ext"'));
  for (const id of ["sky", "ceiling", "outside", "wall", "vig", "mid", "fore", "far", "back", "field", "road", "stops", "life", "near", "clouds", "haze"]) assert.ok(svg.includes(`data-layer="${id}"`), "少了 " + id + " 層");
  assert.ok(/<symbol /.test(svg) && (svg.match(/<use /g) || []).length > 40, "物件要用 symbol 加 use 重複用");
  assert.ok(!/<image/i.test(svg));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(svg.replace(/href="#[a-z0-9-]+"/g, "")), "SVG 裡不准寫死色碼");
  for (const s of STOPS) { assert.ok(!svg.includes(s.title_zh)); assert.ok(!svg.includes(s.title_en)); assert.ok(!svg.includes("FOUNDED")); }
  assert.ok(svg.includes('data-stop="0"') && svg.includes('data-stop="6"'));
  assert.ok(svg.includes('data-board="1"'), "看板的框在 SVG，字在 HTML");
  assert.ok(svg.includes('data-plane="1"') && svg.includes('data-shadow="1"'), "我們那一架飛機與它的影子");
  assert.ok(svg.includes('data-traveller="1"') && svg.includes('class="leg-a"') && svg.includes('class="leg-b"'), "旅客與兩條腿");
  for (const k of ["carts", "fuel", "walker", "bird", "glide"]) assert.ok(svg.includes(`data-mover="${k}"`), "少了會動的 " + k);
  for (const k of ["anim-beacon", "anim-strobe", "anim-idle", "anim-flag"]) assert.ok(svg.includes(k), "少了閒置動畫的鉤子 " + k);
  assert.ok(svg.length < 70000, "SVG 太大：" + svg.length);
  const tallSvg = S.sceneSVG(S.world(7), motifs, true);
  assert.ok(tallSvg.length < 70000);
  assert.ok((tallSvg.match(/<use /g) || []).length < (svg.match(/<use /g) || []).length, "直式要少畫一些");
  // 八種小場景：每一種三個以上的形狀、一個閒置動畫的鉤子；認不出來的名字退回指示牌
  for (const m of S.MOTIFS) { const v = S.vignetteSVG(m); assert.ok(v.includes("<g")); assert.ok((v.match(/<(rect|circle|polygon|path|ellipse|use)/g) || []).length >= 3, m + " 太少形狀"); assert.ok(/class="[^"]*anim-/.test(v), m + " 沒有閒置動畫的鉤子"); }
  assert.equal(S.vignetteSVG("nonsense"), S.vignetteSVG("signpost"));
  // 只放站那一層：二十五站也放得進去，沒有站的文字
  const many = S.stopsSVG(S.world(25), Array(25).fill("signpost")) + S.terminalStopsSVG(S.world(25), Array(25).fill("signpost"));
  assert.equal((many.match(/data-stop=/g) || []).length, 25);
  assert.ok(S.world(25).stops.filter(s => s.phase === "takeoff" && s.y > 0).length >= 1, "起飛那一段離地之後的站站在雲上");
});

test("卡（批 3）：有勾了同意的照片就放第一張當縮圖（lazy、decoding=async、alt 空），沒有照片就沒有 <img>", () => {
  const withPhoto = UI.cardHTML(STOPS[1], 1, "zh");
  assert.match(withPhoto, /<img[^>]*class="card-thumb"[^>]*>/);
  assert.match(withPhoto, /<img[^>]*loading="lazy"/);
  assert.match(withPhoto, /<img[^>]*decoding="async"/);
  assert.match(withPhoto, /<img[^>]*alt=""/);
  assert.ok(withPhoto.includes("history/m1/a.jpg"));
  assert.ok(!UI.cardHTML(STOPS[0], 0, "zh").includes("<img"));
  // 卡上可以有一句話（有才印）
  assert.ok(withPhoto.includes("一句話"));
});

test("骨架（批 3）：一進來先畫一張骨架卡，有 aria-busy，沒有任何一站的文字", () => {
  const h = UI.skeletonHTML("zh");
  assert.ok(h.includes("aria-busy"));
  assert.ok(h.includes("skeleton"));
  for (const s of STOPS) assert.ok(!h.includes(s.title_zh));
  assert.ok(h.includes(STR.zh.loading));
});

test("大年份：顯示字型的真文字，只留數字", () => {
  assert.equal(UI.ghostHTML("2023"), "2023");
  assert.equal(UI.ghostHTML("2023-06"), "202306");
  assert.equal(UI.ghostHTML(""), "");
});

test("年份帶（批 3）：有一顆隨捲動滑的點，大年份小標籤", () => {
  const h = UI.stripHTML(STOPS, 0, "en");
  assert.ok(h.includes('class="strip-dot"'));
  assert.ok(h.includes("strip-year") && h.includes("strip-title"));
});

test("esc：五個該逃的字都逃掉", () => {
  assert.equal(UI.esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  assert.equal(UI.esc(null), "");
});
