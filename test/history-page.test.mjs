// BT 歷史之路（docs/2026-11-05-BT-歷史之路計畫.md）批 2：前台 /history/ 的純函式。
// 跑法：node --test test/*.test.mjs
// 這些測試不開瀏覽器：吃一份假的 public_milestones() 回傳，看吐出來的 HTML 與算出來的數字。
import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../history/src/data.js";
import * as UI from "../history/src/ui.js";
import * as R from "../history/src/road.js";
import fs from "node:fs";
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
  assert.ok("signpost" in R.MOTIF_SCENE, "一定要有預設那一個");
  for (const m of ["seven", "seats", "board", "sign", "boarding", "tail", "crew", "signpost"]) assert.ok(m in R.MOTIF_SCENE, m + " 場景沒畫");
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


// ── 批 5：真的 3D（Three.js）。這裡測的是 airport.js 與 plane.js 的純函式，不開瀏覽器、不載 Three。 ──

test("路（2026-11-17 換骨）：機場、n 站、今天照順序排在一條彎路上，互不重疊，橋 3 到 12 公尺；1、3、7、25 站都成立；有照片的站大一點", () => {
  for (const n of [1, 3, 7, 25]) {
    const w = R.world(n, [true]);
    assert.equal(w.N, n + 2); assert.equal(w.nodes[0].id, "airport"); assert.equal(w.nodes[w.N - 1].id, "end"); assert.equal(w.stations.length, n);
    assert.ok(w.nodes[0].sea && w.end.end);
    for (let a = 0; a < w.N; a++) for (let b = a + 1; b < w.N; b++) { const A = w.nodes[a], B = w.nodes[b]; assert.ok(Math.hypot(A.x - B.x, A.z - B.z) > A.r + B.r + 2, `${n} 站：${A.id} 與 ${B.id} 太近`); }
    assert.equal(w.bridges.length, w.N - 1);
    for (const e of w.bridges) { const len = Math.hypot(e.x1 - e.x0, e.z1 - e.z0); assert.ok(len >= 3 && len <= 12, `${n} 站：橋 ${e.a}→${e.b} ${len.toFixed(1)} 公尺`); }
    // 站照 x 往前排，p 從 0 到 1 遞增
    for (let k = 1; k < w.N; k++) { assert.ok(w.nodes[k].x > w.nodes[k - 1].x); assert.ok(w.nodes[k].p > w.nodes[k - 1].p); }
    assert.equal(w.nodes[0].p, 0); assert.equal(w.end.p, 1);
    // 路上任何一點都算得出來，而且落在兩頭之間
    for (const p of [0, 0.25, 0.5, 0.75, 1]) { const q = w.pointAt(p); assert.ok(q.x >= w.airport.x - 0.01 && q.x <= w.end.x + 0.01); }
    assert.equal(R.nearest(w, 0), 0); assert.equal(R.nearest(w, 1), n - 1);
    for (let i = 0; i < n; i++) assert.equal(R.nearest(w, R.progressFor(w, i)), i);
    // 裝飾小島離每一座都夠遠；人每站兩三個、機場三個、今天一個，沒有名字
    for (const it of R.islets(w)) for (const nd of w.nodes) assert.ok(Math.hypot(it.x - nd.x, it.z - nd.z) > nd.r + it.r + 5, `${n} 站：小島 ${it.id} 貼到 ${nd.id}`);
    const ppl = R.people(w); assert.ok(ppl.length >= 2 * n + 3); for (const pp of ppl) assert.ok(!("name" in pp));
  }
  assert.ok(R.world(2, [true, false]).stations[0].r > R.world(2, [true, false]).stations[1].r, "有照片的站大一點");
  // 導航：橋是一條鏈，從機場到今天要經過每一站；routePoints 照「橋頭、橋尾、島心」一組
  const w = R.world(3); const nav = R.nav(w, new Map(), new Map());
  assert.deepEqual(nav.route("airport", "end"), ["airport", "s0", "s1", "s2", "end"]);
  assert.deepEqual(nav.route("s1", "s1"), ["s1"]);
  const pts = nav.routePoints(["s0", "s1"]); assert.equal(pts.length, 4); assert.deepEqual(pts[0], [w.stations[0].x, w.stations[0].z]); assert.deepEqual(pts[3], [w.stations[1].x, w.stations[1].z]);
  // 代號對場景：每一種代號都有一棟、一套擺設、一種地面；認不出來是路標
  for (const m of ["seven", "seats", "board", "sign", "boarding", "tail", "crew", "signpost"]) { const sc = R.sceneFor(m); assert.ok(sc.kind && sc.scenery && sc.ground, m); }
  assert.equal(R.sceneFor("whatever").kind, "post");
  // 鏡頭：到了一站靠近一點，兩站之間退遠一點；全景有 fit
  const near = R.cameraAt(w, R.progressFor(w, 1), false), far = R.cameraAt(w, R.progressFor(w, 1) + 0.5 / (w.N - 1), false);
  assert.ok(near.pos[1] < far.pos[1]); assert.ok(R.cameraOverview(w, false).fit.length === 2);
});

test("退路：減少動態、?motion=off、沒有 WebGL、Three 載不到，四種都走直立時間軸；全部都有才走 3D（這一頁沒有 GSAP 了）", () => {
  const ok = { reduce: false, motionOff: false, webgl: true, three: true };
  assert.equal(R.pickMode(ok), "3d");
  assert.equal(R.pickMode({ ...ok, reduce: true }), "list");
  assert.equal(R.pickMode({ ...ok, motionOff: true }), "list");
  assert.equal(R.pickMode({ ...ok, webgl: false }), "list");
  assert.equal(R.pickMode({ ...ok, three: false }), "list");
  assert.equal(R.pickMode({}), "list");
});

test("資料與場景分開：scene.js、road.js、index.html、shared/toy.js 裡沒有任何一站的文字；Three 只在 scene.js 與 shared/toy.js；沒有寫死色碼；沒有 GSAP", () => {
  const files = ["history/src/scene.js", "history/src/road.js", "history/index.html", "history/src/main.js", "shared/toy.js", "shared/toy-nav.js"];
  const src = Object.fromEntries(files.map(f => [f, fs.readFileSync(new URL("../" + f, import.meta.url), "utf8")]));
  for (const f of files) for (const s of STOPS) { assert.ok(!src[f].includes(s.title_zh), f + " 有站的中文標題"); assert.ok(!src[f].includes(s.title_en), f + " 有站的英文標題"); }
  for (const f of ["history/src/road.js", "history/src/main.js", "history/src/ui.js", "history/src/data.js", "shared/toy-nav.js"]) assert.ok(!/from\s+["']three["']/.test(src[f] || fs.readFileSync(new URL("../" + f, import.meta.url), "utf8")), f + " 不准 import three");
  assert.ok(/from\s+["']three["']/.test(src["history/src/scene.js"]), "scene.js 用 importmap 的 three");
  assert.ok(/from\s+["']three["']/.test(src["shared/toy.js"]), "toy.js 用 importmap 的 three");
  for (const f of ["history/src/scene.js", "history/src/road.js", "shared/toy.js"]) assert.ok(!/#[0-9a-fA-F]{6}\b/.test(src[f].replace(/\/\/.*$/gm, "")), f + " 裡不准寫死色碼（顏色從 CSS 變數讀）");
  for (const f of files) assert.ok(!/\bgsap\b|ScrollTrigger/i.test(src[f].replace(/<!--[\s\S]*?-->/g, "").replace(/\/\/.*$/gm, "")), f + " 不該有 GSAP");
  // importmap：three 只從 cdnjs 來，帶 integrity
  const im = /<script type="importmap">([\s\S]*?)<\/script>/.exec(src["history/index.html"]);
  assert.ok(im, "index.html 要有 importmap");
  const map = JSON.parse(im[1]);
  assert.match(map.imports.three, /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/\d+\.\d+\.\d+\/three\.module\.min\.js$/);
  assert.match(map.integrity[map.imports.three], /^sha512-[A-Za-z0-9+/=]{88}$/);
  // 沒有模型檔、沒有貼圖檔；舊的機場那三支（airport.js、plane.js、person.js）已經拿掉
  assert.ok(!fs.readdirSync(new URL("../history/", import.meta.url), { recursive: true }).some(f => /\.(glb|gltf|obj|fbx|png|jpg|jpeg|webp|bin)$/i.test(String(f))), "history/ 裡不放模型或圖檔");
  assert.deepEqual(fs.readdirSync(new URL("../history/src/", import.meta.url)).sort(), ["data.js", "main.js", "road.js", "scene.js", "strings.js", "ui.js"]);
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
