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

test("代號對場景：關鍵字決定要畫哪一個小場景，認不出來就是路牌", () => {
  assert.equal(D.motifFor("2020-founded"), "table");
  assert.equal(D.motifFor("2020-mentorship-begins"), "chairs");
  assert.equal(D.motifFor("2021-online-fair"), "laptops");
  assert.equal(D.motifFor("2021-online-expo"), "laptops");
  assert.equal(D.motifFor("2021-campus-ambassadors"), "gate");
  assert.equal(D.motifFor("2023-first-bootcamp"), "tents");
  assert.equal(D.motifFor("2023-summer-camp"), "tents");
  assert.equal(D.motifFor("2025-alumni-accounts"), "pin");
  assert.equal(D.motifFor("today"), "cadre", "seed 的最後一站 today 是「接近三十位幹部」，畫幹部那一組");
  assert.equal(D.motifFor("2024-something-else"), "signpost");
  assert.equal(D.motifFor(""), "signpost");
  assert.equal(D.motifFor(null), "signpost");
  assert.ok(S.MOTIFS.includes("signpost"), "scene.js 一定要有預設那一個");
  for (const m of ["table", "chairs", "laptops", "gate", "tents", "pin", "signpost"]) assert.ok(S.MOTIFS.includes(m), m + " 場景沒畫");
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

test("場景（批 3）：站沿路排在算出來的點上；鏡頭跟著進度沿路走；針孔投影近大遠小、近寬遠窄", () => {
  const w = S.world(7);
  assert.equal(w.stops.length, 7);
  for (let i = 1; i < 7; i++) assert.equal(w.stops[i].z - w.stops[i - 1].z, S.GAP, "站與站沿路等距");
  assert.ok(w.length > w.stops[6].z, "路要比最後一站長");
  assert.equal(S.world(0).stops.length, 0);
  assert.ok(S.world(1).length > 0);
  // 鏡頭：進度 0 停在第一站前面 AHEAD 的地方、進度 1 停在最後一站前面；中間單調往前
  assert.equal(S.camZ(w, 0), w.stops[0].z - S.AHEAD);
  assert.equal(S.camZ(w, 1), w.stops[6].z - S.AHEAD);
  let last = -Infinity;
  for (let p = 0; p <= 1.0001; p += 0.01) { const z = S.camZ(w, p); assert.ok(z >= last - 1e-9, "鏡頭不能倒退"); last = z; }
  assert.ok(Math.abs(S.camZ(w, 0.5) - (w.stops[3].z - S.AHEAD)) < 1e-6, "進度一半剛好在第四站");
  assert.equal(S.nearest(w, 0.5), 3);
  assert.equal(S.nearest(w, 0.99), 6);
  assert.equal(S.progressFor(w, 3), 0.5);
  assert.equal(S.progressFor(S.world(1), 0), 0);
  // 投影：同一條線上越遠的地面點在畫面上越高、越小；在鏡頭後面的點不畫
  const cam = S.camera(1000, false), cz = S.camZ(w, 0);
  const a = S.project(cam, 0, 0, cz + 300, cz), b = S.project(cam, 0, 0, cz + 900, cz), c = S.project(cam, 0, 0, cz + 2500, cz);
  assert.ok(a && b && c);
  assert.ok(a.y > b.y && b.y > c.y, "越遠越高");
  assert.ok(a.s > b.s && b.s > c.s, "越遠越小");
  assert.ok(b.x > a.x, "路往右上退（鏡頭偏轉）");
  assert.equal(S.project(cam, 0, 0, cz - 400, cz), null, "鏡頭後面的點不畫");
  // 站的螢幕點：每一站都算得出來，第一站停在畫面裡
  const pts = S.stopPoints(w, cam, cz);
  assert.equal(pts.length, 7);
  assert.ok(pts[0] && pts[0].x > 0 && pts[0].x < 1000 && pts[0].y > 0 && pts[0].y < S.H, JSON.stringify(pts[0]));
  // 路：近端比遠端寬
  const road = S.roadPolygon(cam, cz, w.length);
  assert.ok(road.points.split(" ").length > 20);
  assert.ok(road.nearWidth > road.farWidth * 3, `近 ${road.nearWidth} 遠 ${road.farWidth}`);
  // 直式（手機）：路更陡，也就是同樣往前一段，畫面上的 y 變化比 x 變化大
  const tall = S.camera(375, true);
  const t1 = S.project(tall, 0, 0, cz + 300, cz), t2 = S.project(tall, 0, 0, cz + 900, cz);
  const w1 = S.project(cam, 0, 0, cz + 300, cz), w2 = S.project(cam, 0, 0, cz + 900, cz);
  assert.ok((t1.y - t2.y) / (t2.x - t1.x) > (w1.y - w2.y) / (w2.x - w1.x), "直式的路要比橫式陡");
});

test("場景 SVG（批 3）：九層都在、有 symbol 與 use、沒有點陣圖、沒有色碼、沒有任何一站的文字、小於 60 KB；直式少一層遠景", () => {
  const motifs = STOPS.map(s => D.motifFor(s.slug));
  const svg = S.sceneSVG(S.world(7), motifs, false);
  for (const id of ["sky", "far", "back", "town", "road", "stops", "life", "near", "haze"]) assert.ok(svg.includes(`data-layer="${id}"`), "少了 " + id + " 層");
  assert.ok(/<symbol /.test(svg) && (svg.match(/<use /g) || []).length > 30, "物件要用 symbol 加 use 重複用");
  assert.ok(!/<image/i.test(svg));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(svg.replace(/href="#[a-z-]+"/g, "")), "SVG 裡不准寫死色碼");
  for (const s of STOPS) { assert.ok(!svg.includes(s.title_zh)); assert.ok(!svg.includes(s.title_en)); }
  assert.ok(svg.includes('data-stop="0"') && svg.includes('data-stop="6"'));
  assert.ok(svg.length < 60000, "SVG 太大：" + svg.length);
  for (const m of S.MOTIFS) assert.ok(S.vignetteSVG(m).includes("<g"), m);
  assert.equal(S.vignetteSVG("nonsense"), S.vignetteSVG("signpost"));
  // 每一種小場景至少三個形狀、有一個閒置動畫的鉤子
  for (const m of S.MOTIFS) { const v = S.vignetteSVG(m); assert.ok((v.match(/<(rect|circle|polygon|path|ellipse|use)/g) || []).length >= 3, m + " 太少形狀"); assert.ok(/class="[^"]*anim-/.test(v), m + " 沒有閒置動畫的鉤子"); }
  const tallSvg = S.sceneSVG(S.world(7), motifs, true);
  assert.ok(!tallSvg.includes('data-layer="back"') || (tallSvg.match(/<use /g) || []).length < (svg.match(/<use /g) || []).length, "直式要少畫一些遠景");
  // 會動的東西：公車、機車、人、鳥
  for (const k of ["bus", "scooter", "walker", "bird"]) assert.ok(svg.includes(`data-mover="${k}"`), "少了會動的 " + k);
});

test("代號對場景（批 3）：多一種 cadre；全部八種場景都畫得出來", () => {
  assert.equal(D.motifFor("2026-cadre-thirty"), "cadre");
  assert.equal(D.motifFor("2027-new-officers"), "cadre");
  for (const m of ["table", "chairs", "laptops", "gate", "tents", "pin", "cadre", "signpost"]) assert.ok(S.MOTIFS.includes(m), m + " 場景沒畫");
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
