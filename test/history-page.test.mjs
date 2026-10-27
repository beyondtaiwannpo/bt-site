// BT 歷史之路（docs/2026-11-05-BT-歷史之路計畫.md）批 2：前台 /history/ 的純函式。
// 跑法：node --test test/*.test.mjs
// 這些測試不開瀏覽器：吃一份假的 public_milestones() 回傳，看吐出來的 HTML 與算出來的數字。
import { test } from "node:test";
import assert from "node:assert/strict";
import * as D from "../history/src/data.js";
import * as UI from "../history/src/ui.js";
import * as A from "../history/src/airport.js";
import { buildAirliner, PLANE_PARTS, setGear, steerNose } from "../history/src/plane.js";
import { buildPerson, posePerson, PERSON_PARTS, PERSON_VARIANTS, HEIGHT } from "../history/src/person.js";
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
  assert.ok(A.MOTIFS.includes("signpost"), "一定要有預設那一個");
  for (const m of ["seven", "seats", "board", "sign", "boarding", "tail", "crew", "signpost"]) assert.ok(A.MOTIFS.includes(m), m + " 場景沒畫");
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

// Three 的替身：plane.js 吃一個 THREE 物件，測試給它一個什麼都接得住的殼，只記名字與樹狀結構。
function fakeThree() {
  const vec = (x = 0, y = 0, z = 0) => { const v = { x, y, z }; v.set = (a, b, c) => { v.x = a; v.y = b; v.z = c; return v; }; v.copy = o => v.set(o.x, o.y, o.z); v.clone = () => vec(v.x, v.y, v.z); return v; };
  class Node {
    constructor(...args) { this.args = args; this.children = []; this.name = ""; this.position = vec(); this.rotation = vec(); this.scale = vec(1, 1, 1); this.castShadow = false; this.receiveShadow = false; this.userData = {}; }
    add(...cs) { for (const c of cs) { this.children.push(c); c.parent = this; } return this; }
    traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
    getObjectByName(n) { let hit = null; this.traverse(o => { if (!hit && o.name === n) hit = o; }); return hit; }
  }
  const chain = new Proxy(class Any { constructor(...a) { this.args = a; } }, { construct(T, a) { return new Proxy(new T(...a), { get: (o, k) => k in o ? o[k] : (() => chainObj) }); } });
  const chainObj = new Proxy({}, { get: (o, k) => k === "then" ? undefined : (() => chainObj) });
  const nodeTypes = new Set(["Group", "Object3D", "Mesh", "InstancedMesh", "Sprite"]);
  return new Proxy({}, { get: (_, k) => nodeTypes.has(k) ? Node : (k === "Vector3" || k === "Vector2") ? function (x, y, z) { return vec(x, y, z); } : chain });
}

test("飛機工廠（批 5）：全部用基本幾何組，零件名字齊全，兩種尾翼色；起落架收放、機鼻輪轉向只動對應的零件", () => {
  const THREE = fakeThree();
  const plane = buildAirliner(THREE, { tail: 0xff0000, body: 0xffffff });
  const names = []; plane.traverse(o => { if (o.name) names.push(o.name); });
  for (const part of PLANE_PARTS) assert.ok(names.includes(part), "少了零件 " + part);
  assert.equal(PLANE_PARTS.filter(n => /^wing/.test(n)).length, 2);
  assert.equal(PLANE_PARTS.filter(n => /^engine/.test(n)).length, 2);
  assert.ok(PLANE_PARTS.includes("fin") && PLANE_PARTS.includes("finTaiwan") && PLANE_PARTS.includes("cockpit") && PLANE_PARTS.includes("windows"));
  assert.ok(PLANE_PARTS.includes("gearNose") && PLANE_PARTS.includes("gearMainL") && PLANE_PARTS.includes("gearMainR"));
  assert.ok(names.filter(n => n === "wheel").length >= 3, "至少三個輪子");
  // 起落架：1 放下、0 收起（三組都收進去）
  setGear(plane, 1);
  const nose = plane.getObjectByName("gearNose"), left = plane.getObjectByName("gearMainL");
  const yDown = nose.position.y, rotDown = left.rotation.x;
  setGear(plane, 0);
  assert.ok(nose.position.y > yDown, "收起來的起落架要往上");
  assert.notEqual(left.rotation.x, rotDown, "主起落架收起來要轉進翼根");
  // 機鼻輪轉向
  steerNose(plane, 0.4);
  assert.ok(Math.abs(nose.rotation.y - 0.4) < 1e-9);
  // 工廠的參數：不同尾翼色、不同比例
  const other = buildAirliner(THREE, { tail: 0x00ff00, body: 0xffffff, scale: 0.8 });
  assert.equal(other.scale.x, 0.8);
});

test("人物工廠（批 5 第三輪）：七頭身的人，頭、頭髮、臉、脖子、軀幹、兩手兩掌、兩腿兩鞋都在；七種樣子各自多對的零件；走路腿會擺、坐著髖膝都彎", () => {
  const THREE = fakeThree();
  const base = { skin: 1, hair: 2, shirt: 3, trousers: 4, shoe: 5, accent: 6 };
  assert.deepEqual(PERSON_VARIANTS, ["default", "backpack", "bag", "staff", "crew", "seated", "skirt"]);
  assert.ok(Math.abs(HEIGHT - 1.75) < 0.01);
  for (const variant of PERSON_VARIANTS) {
    const p = buildPerson(THREE, { ...base, variant, phase: 0.5 });
    const names = []; p.traverse(o => { if (o.name) names.push(o.name); });
    for (const part of PERSON_PARTS) assert.ok(names.includes(part), variant + " 少了 " + part);
    assert.equal(names.filter(n => n === "sleeve").length, 2, "兩隻短袖"); assert.equal(names.filter(n => n === "knee").length, 2, "兩個膝");
    assert.equal(p.userData.variant, variant);
    if (variant === "backpack") assert.ok(names.includes("backpack"));
    if (variant === "bag") assert.ok(names.includes("bag") && names.includes("bagBody"));
    if (variant === "crew") assert.ok(names.includes("vest") && names.filter(n => n === "paddle").length === 2, "地勤有背心與兩支指揮板");
    if (variant === "skirt") assert.ok(names.includes("skirt"));
  }
  assert.equal(buildPerson(THREE, { ...base, variant: "nonsense" }).userData.variant, "default");
  // 站著：重心偏一邊（髖微轉）；走路：兩腿反向擺、膝會彎；坐著：髖與膝彎 90 度
  const p = buildPerson(THREE, { ...base, phase: 0.5 });
  posePerson(p, 0, false); assert.ok(Math.abs(p.getObjectByName("hips").rotation.z) > 0.01, "站著要有重心偏移");
  posePerson(p, 0.3, true);
  const L = p.getObjectByName("legL"), R = p.getObjectByName("legR");
  assert.ok(Math.abs(L.rotation.x) > 0.1 && Math.sign(L.rotation.x) === -Math.sign(R.rotation.x), "走路兩腿反向擺");
  assert.ok(Math.abs(p.getObjectByName("armL").rotation.x) > 0.1, "手跟著擺");
  const seated = buildPerson(THREE, { ...base, variant: "seated" });
  assert.ok(Math.abs(seated.getObjectByName("legL").rotation.x + Math.PI / 2) < 0.2 && Math.abs(seated.getObjectByName("legL").getObjectByName("knee").rotation.x - Math.PI / 2) < 0.2, "坐著髖與膝都彎 90 度");
});

test("滑行道（批 5）：路點至少三個真的轉彎，樣條連續、等弧長取樣、頭尾落在路點上；從登機門推出到跑道頭", () => {
  const pts = A.TAXI_WAYPOINTS;
  assert.ok(pts.length >= 6);
  assert.ok(A.polylineTurns(pts, 35) >= 3, "至少三個 35 度以上的轉彎，現在 " + A.polylineTurns(pts, 35));
  const tw = A.taxiway();
  assert.ok(tw.length > 300, "滑行道總長 " + tw.length);
  const first = tw.at(0), last = tw.at(tw.length);
  assert.ok(Math.hypot(first.x - pts[0][0], first.z - pts[0][1]) < 1e-6);
  assert.ok(Math.hypot(last.x - pts[pts.length - 1][0], last.z - pts[pts.length - 1][1]) < 1e-6);
  // 連續：相鄰 1 公尺的點距離不超過 1.5 公尺（等弧長取樣沒有跳）
  for (let d = 0; d < tw.length - 1; d += 1) { const a = tw.at(d), b = tw.at(d + 1); const gap = Math.hypot(a.x - b.x, a.z - b.z); assert.ok(gap > 0.5 && gap < 1.5, "弧長 " + d + " 跳了 " + gap); }
  // 切線是單位向量；轉彎處的航向變了
  const t0 = tw.at(5).yaw, tEnd = tw.at(tw.length - 5).yaw;
  assert.ok(Math.abs(((t0 - tEnd + Math.PI) % (2 * Math.PI)) - Math.PI) > 0.5, "起點與終點的航向要不一樣（有轉過彎）");
  // 跑道頭：最後一個路點落在跑道上
  assert.ok(Math.abs(pts[pts.length - 1][1] - A.RUNWAY.z) < 1e-6, "滑行道要接到跑道中線");
  assert.ok(pts[pts.length - 1][0] <= A.RUNWAY.x1 && pts[pts.length - 1][0] >= A.RUNWAY.x0);
});

test("飛機的姿態（批 5）：登機前停在登機門、0.40 到 0.80 沿滑行道不倒退、在地上不側傾、機鼻輪在轉彎處會轉、起飛段加速抬頭收輪爬升", () => {
  const g = A.planePoseAt(0.2), g2 = A.planePoseAt(0.39);
  assert.deepEqual([g.x, g.z], [g2.x, g2.z], "登機前飛機不動");
  assert.deepEqual([g.x, g.z], A.GATE_STAND, "停在登機門的停機位");
  assert.equal(g.gear, 1); assert.equal(g.y, 0);
  // 沿滑行道走：弧長單調、不側傾、在地上
  let lastS = -1;
  for (let e = 0.40; e <= 0.80; e += 0.002) {
    const q = A.planePoseAt(e);
    assert.ok(q.s >= lastS - 1e-9, "弧長倒退 " + e); lastS = q.s;
    assert.equal(q.roll, 0); assert.equal(q.y, 0); assert.equal(q.gear, 1);
  }
  // 推出去那一段是倒退：航向不變、位置沿航向的反方向走
  const p0 = A.planePoseAt(0.40), p1 = A.planePoseAt(0.42);
  assert.ok(Math.abs(p0.yaw - p1.yaw) < 0.05, "推出去的時候機頭方向不變");
  assert.ok(p1.pushback && p1.s > 0, "推出去那一段 pushback 要是 true");
  // 機鼻輪：整段裡有轉過（絕對值超過 0.15 弧度），直線上接近 0
  let maxSteer = 0; for (let e = 0.44; e <= 0.80; e += 0.002) maxSteer = Math.max(maxSteer, Math.abs(A.planePoseAt(e).steer));
  assert.ok(maxSteer > 0.15, "機鼻輪沒轉：" + maxSteer);
  // 起飛：速度（弧長的差）遞增、對正跑道、抬頭、收輪、爬升；最後一刻在高空
  const r0 = A.planePoseAt(0.80), r1 = A.planePoseAt(0.84), r2 = A.planePoseAt(0.88);
  assert.ok(Math.abs(r0.z - A.RUNWAY.z) < 1, "對正跑道中線");
  assert.ok(Math.abs(r1.x - r0.x) < Math.abs(r2.x - r1.x), "加速：後一段走得比前一段遠");
  assert.ok(A.planePoseAt(0.9).pitch > 0.05 && A.planePoseAt(0.9).y > 0, "0.9 已經抬頭離地");
  assert.ok(A.planePoseAt(0.9).gear < 1 && A.planePoseAt(1).gear === 0, "離地後收輪");
  assert.ok(A.planePoseAt(1).y > 250, "進度 1 在高空");
  let lastY = -1; for (let e = 0.86; e <= 1.0001; e += 0.005) { const y = A.planePoseAt(e).y; assert.ok(y >= lastY - 1e-9, "爬升不掉高度 " + e); lastY = y; }
});

test("鏡頭樣條（批 5）：航廈往前走在人的高度、空橋那一段一條連續曲線不跳、停機坪高角度跟著飛機、起飛追在後面升高；每一段取樣都在 0 到 1 連續", () => {
  // 整條路每千分之一取樣，相鄰兩幀的鏡頭位置不跳（最大一步看段：航廈慢、起飛快）
  let prev = A.cameraAt(0);
  for (let e = 0.001; e <= 1.0001; e += 0.001) {
    const c = A.cameraAt(e); const step = Math.hypot(c.pos[0] - prev.pos[0], c.pos[1] - prev.pos[1], c.pos[2] - prev.pos[2]);
    const limit = e < 0.335 ? 4 : e < 0.8 ? 8 : 40;   // 航廈與空橋走路、升高後退、起飛追，三種速度
    assert.ok(step < limit, `鏡頭在 ${e.toFixed(3)} 跳了 ${step.toFixed(1)}`);
    assert.ok(c.fov > 20 && c.fov < 80); prev = c;
  }
  // 航廈：在人的眼睛高度、沿走道往 +X 走、看向前方
  const a = A.cameraAt(0.05), b = A.cameraAt(0.25);
  assert.ok(a.pos[1] > 1.3 && a.pos[1] < 2.2 && b.pos[1] > 1.3 && b.pos[1] < 2.2, "航廈的鏡頭在人的高度");
  assert.ok(b.pos[0] > a.pos[0] + 20, "航廈的鏡頭往前走");
  assert.ok(a.look[0] > a.pos[0], "看向前方");
  const T = A.TERMINAL;
  assert.ok(a.pos[2] > T.z0 && a.pos[2] < T.z1 && a.pos[0] > T.x0 && a.pos[0] < T.x1, "鏡頭在航廈體積裡面");
  // 空橋：0.30 還在室內低處、0.40 已經在室外高處；中間單調升高
  const c30 = A.cameraAt(0.30), c40 = A.cameraAt(0.40);
  assert.ok(c30.pos[1] < 3 && c40.pos[1] > 40, "空橋那一段從人的高度升到停機坪的視角");
  assert.ok(c40.pos[2] > T.z1, "0.40 的鏡頭在航廈外面（停機坪那一側）");
  // 停機坪：鏡頭跟著飛機，離飛機的水平距離固定，俯角在 30 到 45 度
  for (const e of [0.45, 0.55, 0.65, 0.75]) {
    const c = A.cameraAt(e), q = A.planePoseAt(e);
    const dx = c.pos[0] - q.x, dz = c.pos[2] - q.z, dh = Math.hypot(dx, dz), ang = Math.atan2(c.pos[1] - q.y, dh) * 180 / Math.PI;
    assert.ok(ang > 28 && ang < 46, "俯角 " + ang.toFixed(1) + " 在 " + e);
    assert.ok(Math.hypot(c.look[0] - q.x, c.look[2] - q.z) < 25, "看著飛機附近");
  }
  // 起飛：鏡頭在飛機後面（飛機往 -X 飛，所以鏡頭 X 比飛機大）、比飛機高一點、跟著爬
  const t1 = A.cameraAt(0.95), q1 = A.planePoseAt(0.95), t2 = A.cameraAt(1), q2 = A.planePoseAt(1);
  assert.ok(t1.pos[0] > q1.x && t2.pos[0] > q2.x, "追在飛機後面");
  assert.ok(t2.pos[1] > t1.pos[1] && t2.pos[1] > q2.y * 0.6, "跟著爬升");
});

test("鏡頭不穿牆（批 5 第二輪）：航廈與空橋那兩段每百分之一取樣，鏡頭不在任何一面牆裡、離牆至少 0.3 公尺、而且一直在准待的地方（航廈裡、門口、空橋 A、空橋 B）", () => {
  assert.ok(A.WALLS.length >= 8 && A.VOLUMES.length === 4);
  // 0 到 0.33 每百分之一，加上鏡頭停在機艙門前的 0.335；0.34 起鏡頭已經升上去了（那一段是刻意穿過空橋 B 段的玻璃頂）。
  for (const e of [...Array.from({ length: 34 }, (_, k) => k / 100), 0.335]) {
    const c = A.cameraAt(e), p = c.pos;
    for (const B of A.WALLS) assert.ok(A.boxDistance(p, B) >= 0.3, `鏡頭在 ${e} 離牆太近：${p.map(v => v.toFixed(1))} 牆 ${B}`);
    assert.ok(A.VOLUMES.some(V => p[0] > V[0] && p[0] < V[1] && p[2] > V[2] && p[2] < V[3]), `鏡頭在 ${e} 跑到准待的地方外面：${p.map(v => v.toFixed(1))}`);
    assert.ok(p[1] > 1.2 && p[1] < 5, "人的高度（空橋是斜的所以會升到 4.1）");
    // 旅客也一樣不穿牆
    const t = A.travellerAt(e); if (t.visible) for (const B of A.WALLS) assert.ok(!A.insideBox([t.pos[0], t.pos[1] + 1, t.pos[2]], B), `旅客在 ${e} 走進牆裡`);
  }
  // 空橋是兩段直的：A 段沿 z、B 段沿 x，兩段都接得上
  assert.equal(A.BRIDGE.x, A.GATE_DOOR[0]); assert.equal(A.BRIDGE.zEnd, A.PLANE_DOOR[1]);
  assert.ok(A.bridgeFloorY(0, 0) === 0 && A.bridgeFloorY(0, A.BRIDGE.zEnd) === A.BRIDGE.floorEnd);
});

test("看板的版面（批 5 第二輪）：貼圖至少 1024 寬、列高至少 48 像素；站多到放不下就只顯示現在這一站附近那幾列", () => {
  for (const n of [1, 7, 12, 25]) {
    const L = A.boardLayout(n);
    assert.ok(L.width >= 1024, "寬 " + L.width);
    assert.ok(L.rowH >= 48, n + " 站的列高 " + L.rowH);
    assert.ok(L.visible >= 1 && L.visible <= n && L.top + L.visible * L.rowH <= L.height, n + " 站放得下 " + L.visible + " 列");
  }
  assert.equal(A.boardLayout(7).visible, 7, "七站全部放得下");
  const L25 = A.boardLayout(25);
  assert.ok(L25.visible < 25);
  assert.equal(A.boardWindow(25, 0, L25.visible), 0);
  assert.equal(A.boardWindow(25, 24, L25.visible), 25 - L25.visible);
  const mid = A.boardWindow(25, 12, L25.visible); assert.ok(mid <= 12 && mid + L25.visible > 12, "現在這一站一定在窗裡");
});

test("旅客（批 5）：航廈裡走在鏡頭前面、進空橋、上飛機就看不到了；走路的循環只在他在走的時候", () => {
  const a = A.travellerAt(0.05), c = A.cameraAt(0.05);
  assert.ok(a.visible && a.walking);
  assert.ok(a.pos[0] > c.pos[0] + 2 && a.pos[0] < c.pos[0] + 12, "在鏡頭前面幾公尺");
  const d = A.travellerAt(0.33);
  assert.ok(d.visible && d.pos[2] > A.TERMINAL.z1 - 1, "0.33 已經走進空橋（過了玻璃牆）");
  assert.ok(!A.travellerAt(0.42).visible, "上了飛機就看不到");
  assert.ok(!A.travellerAt(0.9).visible);
});

test("站（批 5）：平均分在 0 到 1 上，每一站有一個 3D 錨點與一段；航廈的站在走道旁、停機坪的站在滑行道旁、起飛的站跟著飛機；1、7、25 站都成立", () => {
  assert.deepEqual(Object.keys(A.PHASES), ["terminal", "bridge", "apron", "takeoff"]);
  assert.equal(A.phaseFor(0), "terminal"); assert.equal(A.phaseFor(0.3), "bridge"); assert.equal(A.phaseFor(0.4), "apron"); assert.equal(A.phaseFor(0.8), "takeoff"); assert.equal(A.phaseFor(1.5), "takeoff");
  const w = A.world(7);
  assert.deepEqual(w.stops.map(s => +s.p.toFixed(3)), [0, 0.167, 0.333, 0.5, 0.667, 0.833, 1]);
  assert.deepEqual(w.stops.map(s => s.phase), ["terminal", "terminal", "terminal", "apron", "apron", "takeoff", "takeoff"]);
  for (let i = 0; i < 7; i++) { assert.equal(A.progressFor(w, i), i / 6); assert.equal(w.stops[i].anchor.length, 3); }
  const T = A.TERMINAL;
  for (const s of w.stops.slice(0, 2)) assert.ok(s.anchor[0] > T.x0 && s.anchor[0] < T.x1 && s.anchor[2] > T.z0 && s.anchor[2] < T.z1, "航廈的站在航廈裡 " + s.anchor);
  assert.ok(w.stops[1].anchor[0] > w.stops[0].anchor[0], "航廈的站沿走道往前");
  // 停機坪的站在滑行道旁：離飛機在那一刻的位置 8 到 40 公尺
  for (const s of w.stops.filter(s => s.phase === "apron")) { const q = A.planePoseAt(s.p); const d = Math.hypot(s.anchor[0] - q.x, s.anchor[2] - q.z); assert.ok(d > 8 && d < 40, "停機坪的站離飛機 " + d); }
  // 起飛的站：最後一站在空中跟著飛機
  const lastStop = w.stops[6], q = A.planePoseAt(1); assert.ok(lastStop.anchor[1] > 100 && Math.hypot(lastStop.anchor[0] - q.x, lastStop.anchor[2] - q.z) < 80);
  assert.equal(A.world(1).stops.length, 1); assert.equal(A.world(0).stops.length, 0);
  const big = A.world(25); const seen = new Set();
  for (const s of big.stops) { const k = s.anchor.map(v => v.toFixed(1)).join(","); assert.ok(!seen.has(k), "兩站疊在 " + k); seen.add(k); }
  assert.ok(big.stops.filter(s => s.phase === "apron").length >= 9);
  // 每一站帶一個小場景的位置（motif 由 data.js 決定，這裡只給位置與朝向）
  for (const s of w.stops) assert.ok(typeof s.yaw === "number");
  // 慢下來的進度：每一站的 p 對自己不變，中間單調
  for (let i = 0; i < 7; i++) assert.ok(Math.abs(A.eased(w, i / 6) - i / 6) < 1e-9);
  let last = -1; for (let p = 0; p <= 1.0001; p += 0.005) { const e = A.eased(w, p); assert.ok(e >= last - 1e-9); last = e; }
  assert.equal(A.nearest(w, 0.5), 3); assert.equal(A.nearest(w, 0.99), 6);
});

test("登機門號碼與出發看板（批 5）：登機門的牌從站的序號來、跟看板那一欄一致；看板的字只從 boardRows 來", () => {
  assert.equal(A.gateFor(0), "A1"); assert.equal(A.gateFor(6), "A7");
  const rows = UI.boardRows(STOPS, 1);
  for (let i = 0; i < rows.length; i++) assert.equal(rows[i].gate, A.gateFor(i));
  // 旅客登機的那一個登機門：落在空橋之前最後一站的號碼
  assert.equal(A.boardingGate(7), "A3", "七站：第三站（序號 2）是走進空橋前最後一站");
  assert.equal(A.boardingGate(1), "A1");
  assert.equal(A.boardingGate(25), "A" + (A.world(25).stops.filter(s => s.p < A.PHASES.bridge[1]).length), "空橋結束之前的站都算在登機門之前");
  // 看板的 canvas 文字：一列一行，欄位順序 TIME DESTINATION FLIGHT GATE STATUS
  const lines = A.boardLines(rows);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[1].cells, ["2023", "FIRST COLLEGE BOOTCAMP", "BT02", "A2", "BOARDING"]);
  assert.equal(lines[1].now, true);
  assert.deepEqual(A.boardLines([]), []);
});

test("退路（批 5）：減少動態、?motion=off、沒有 WebGL、Three 或 GSAP 載不到，四種都走直立時間軸；全部都有才走 3D", () => {
  const ok = { reduce: false, motionOff: false, webgl: true, gsap: true, three: true };
  assert.equal(A.pickMode(ok), "3d");
  assert.equal(A.pickMode({ ...ok, reduce: true }), "timeline");
  assert.equal(A.pickMode({ ...ok, motionOff: true }), "timeline");
  assert.equal(A.pickMode({ ...ok, webgl: false }), "timeline");
  assert.equal(A.pickMode({ ...ok, gsap: false }), "timeline");
  assert.equal(A.pickMode({ ...ok, three: false }), "timeline");
  assert.equal(A.pickMode({}), "timeline");
  // 像素密度與陰影貼圖：手機降一級
  assert.deepEqual(A.quality({ phone: false, dpr: 3 }), { dpr: 2, shadow: 1024 });
  assert.deepEqual(A.quality({ phone: true, dpr: 3 }), { dpr: 1.5, shadow: 512 });
  assert.deepEqual(A.quality({ phone: false, dpr: 1 }), { dpr: 1, shadow: 1024 });
});

test("資料與場景分開（批 5）：scene.js、airport.js、plane.js、index.html 裡沒有任何一站的文字；Three 只在 scene.js 與 plane.js 出現；程式碼裡沒有寫死色碼", () => {
  const files = ["history/src/scene.js", "history/src/airport.js", "history/src/plane.js", "history/src/person.js", "history/index.html", "history/src/main.js"];
  const src = Object.fromEntries(files.map(f => [f, fs.readFileSync(new URL("../" + f, import.meta.url), "utf8")]));
  for (const f of files) for (const s of STOPS) { assert.ok(!src[f].includes(s.title_zh), f + " 有站的中文標題"); assert.ok(!src[f].includes(s.title_en), f + " 有站的英文標題"); }
  for (const f of ["history/src/airport.js", "history/src/main.js", "history/src/ui.js", "history/src/data.js"]) assert.ok(!/from\s+["']three["']/.test(src[f] || fs.readFileSync(new URL("../" + f, import.meta.url), "utf8")), f + " 不准 import three");
  assert.ok(/from\s+["']three["']/.test(src["history/src/scene.js"]), "scene.js 用 importmap 的 three");
  for (const f of ["history/src/scene.js", "history/src/airport.js", "history/src/plane.js", "history/src/person.js"]) assert.ok(!/#[0-9a-fA-F]{6}\b/.test(src[f].replace(/\/\/.*$/gm, "")), f + " 裡不准寫死色碼（顏色從 CSS 變數讀）");
  // importmap：three 只從 cdnjs 來，帶 integrity
  const im = /<script type="importmap">([\s\S]*?)<\/script>/.exec(src["history/index.html"]);
  assert.ok(im, "index.html 要有 importmap");
  const map = JSON.parse(im[1]);
  assert.match(map.imports.three, /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/\d+\.\d+\.\d+\/three\.module\.min\.js$/);
  assert.match(map.integrity[map.imports.three], /^sha512-[A-Za-z0-9+/=]{88}$/);
  // 沒有模型檔、沒有貼圖檔
  assert.ok(!fs.readdirSync(new URL("../history/", import.meta.url), { recursive: true }).some(f => /\.(glb|gltf|obj|fbx|png|jpg|jpeg|webp|bin)$/i.test(String(f))), "history/ 裡不放模型或圖檔");
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
