// 2026-10-28 Paul：月份全部自己管、實習分類自己管、自動存不要邊打邊存、格子要有時間與範例照片、可以直接跳去看板排會。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { passportAdminHTML, activityEditHTML, internAdminHTML, internGroupEditHTML, setInternGroups, INTERN_CATS, boardLink, localInput, setLang } from "../admin/passports/src/ui.js";
import * as PASS from "../passport/src/ui.js";
import * as INTERN from "../intern-passport/src/ui.js";
import { cellOf, cellInstant } from "../availability/src/calendar.js";
setLang("zh"); PASS.setLang("zh"); INTERN.setLang("zh");

const MONTHS = [{ seq: 3, month: 11, hidden: false, revealed: true }, { seq: 4, month: 12, hidden: false, revealed: false }, { seq: 5, month: 1, hidden: false, revealed: false }];
const ACTS = [{ id: "09B", month: 11, seq: 3, category: "prompt", title_zh: "今年我想要的", title_en: "WHAT I WANT", active: true }];

test("後台月份：加一個月只列還沒有的、排順序、空的月份才有刪、沒人蓋過的格子可以搬", () => {
  const h = passportAdminHTML({ months: MONTHS, activities: ACTS, destinations: [], stamped: {} }, "", false, null, []);
  const add = h.slice(h.indexOf('id="add-month"'), h.indexOf("</select>", h.indexOf('id="add-month"')));
  assert.match(add, /value="9"/); assert.match(add, /value="8"/); assert.doesNotMatch(add, /value="11"/);
  const nov = h.slice(h.indexOf('id="m11"'), h.indexOf('id="m12"'));
  assert.doesNotMatch(nov, /data-dir="-1"/, "第一個月沒有往前"); assert.match(nov, /data-act="month-move"[^>]*data-dir="1"/);
  assert.doesNotMatch(nov, /month-del/, "有格子的月份沒有刪"); assert.match(nov, /data-act="act-move" data-id="09B"/);
  const jan = h.slice(h.indexOf('id="m1"'));
  assert.match(jan, /month-del/); assert.doesNotMatch(jan, /data-dir="1"/, "最後一個月沒有往後");
  const stamped = passportAdminHTML({ months: MONTHS, activities: ACTS, destinations: [], stamped: { "09B": 2 } }, "", false, null, []);
  assert.doesNotMatch(stamped, /act-move/, "有人蓋過的格子不給搬");
});

test("改格子：主持人那個勾拿掉、多時間、範例照片、到看板排會的連結帶標題與時間", () => {
  const a = { ...ACTS[0], happens_at: "2026-11-22T12:00:00.000Z", example_url: "https://x.supabase.co/storage/v1/object/public/passport-examples/09B/1.jpg" };
  const h = activityEditHTML(a, 11, MONTHS, "", false, null);
  assert.doesNotMatch(h, /needs_host/); assert.match(h, /type="datetime-local"/);
  assert.match(h, /class="exprev"/); assert.match(h, /data-act="ak-photo-del"[^>]*data-slot="1"/);
  // 兩張（2026-10-28）：第一張有圖，第二格是選檔案；第一張空著就不給第二格。
  assert.match(h, /class="ak-photo"[^>]*data-noauto="1"[^>]*data-slot="2"/, "第二張可以選，而且不走自動存");
  const none = activityEditHTML({ ...a, example_url: null }, 11, MONTHS, "", false, null);
  assert.match(none, /class="ak-photo"[^>]*data-slot="1"/); assert.doesNotMatch(none, /data-slot="2"/, "第一張空著不給第二格");
  const both = activityEditHTML({ ...a, example_url_2: a.example_url.replace("1.jpg", "2.jpg") }, 11, MONTHS, "", false, null);
  assert.equal((both.match(/class="exprev"/g) || []).length, 2); assert.doesNotMatch(both, /class="ak-photo"/, "兩張都滿就沒有選檔案");
  const link = boardLink(a);
  assert.match(link, /^\.\.\/\.\.\/availability\/\?title=/); assert.match(link, /at=2026-11-22T12%3A00%3A00\.000Z/);
  assert.equal(localInput(""), "");
  assert.match(localInput(a.happens_at), /^\d{4}-\d\d-\d\dT\d\d:\d\d$/);
  assert.doesNotMatch(activityEditHTML(null, 11, MONTHS, "", false, null), /ak-photo/, "新的格子先存才能放照片");
});

test("護照：格子上印時間與範例縮圖，蓋過章就不印", () => {
  const a = { id: "11C", month: 11, category: "frame", title_zh: "天空", title_en: "SKY", description: "", happens_at: "2026-11-22T12:00:00Z", example_url: "https://x/y.jpg" };
  const S = { months: MONTHS, activities: [a], stamps: {}, entries: {}, flipped: {}, profile: { id: "u" } };
  const h = PASS.slotHTML(S, a);
  assert.match(h, /class="when"/); assert.match(h, /class="example" src="https:\/\/x\/y\.jpg"/);
  const two = PASS.slotHTML(S, { ...a, example_url_2: "https://x/z.jpg" });
  assert.equal((two.match(/class="example"/g) || []).length, 2, "兩張都印在格子上");
  assert.deepEqual(PASS.exampleUrls({ example_url_2: "b" }), ["b"]); assert.deepEqual(PASS.exampleUrls({}), []);
  assert.equal(PASS.whenText("2026-11-22T12:00:00Z", "Asia/Taipei").includes("20:00"), true);
  assert.equal(PASS.whenText(""), "");
});

test("看板：從那條連結帶的時間，找得到是這一週的哪一格", () => {
  const tz = "Asia/Taipei";
  const ws = new Date("2026-11-15T16:00:00Z"); // 台北 11/16（一）00:00
  const at = cellInstant(ws, 5, 20 * 60 + 30, tz);
  assert.deepEqual(cellOf(at, ws, tz), { col: 5, min: 1230 });
  assert.deepEqual(cellOf(new Date("2026-11-22T12:10:00Z"), ws, tz), { col: 6, min: 1200 }, "往下取到半小時");
  assert.equal(cellOf(new Date("2026-11-30T12:00:00Z"), ws, tz), null, "不在這一週");
  const m = readFileSync("availability/src/main.js", "utf8");
  assert.match(m, /openFromLink\(new URLSearchParams\(location\.search\)\)/);
});

test("實習分類：從資料庫來就換掉寫死的三個，頁序、名字、棋盤顏色跟著變", () => {
  const groups = [{ key: "onboard", seq: 1, name_zh: "入門", name_en: "Onboard", tagline_en: "First month" },
                  { key: "gshare", seq: 2, name_zh: "分享", name_en: "Share", tagline_zh: "跟大家說" },
                  { key: "reflect", seq: 3, name_zh: "反思", name_en: "Reflect" }];
  INTERN.setGroups(groups);
  assert.deepEqual(INTERN.SLOT_ORDER, ["onboard", "gshare", "reflect"]);
  const S = { tasks: [{ id: "T1", category: "gshare", title_zh: "分享一次", title_en: "SHARE" }], stamps: {}, entries: {}, flipped: {}, profile: { id: "u" } };
  const pages = INTERN.pagesOf(S);
  assert.deepEqual(pages.filter(p => p.kind === "cat").map(p => p.label), ["分享"]);
  assert.match(INTERN.catPageHTML(S, "gshare"), /跟大家說/);
  assert.equal(INTERN.toneOf("gshare"), "project"); assert.equal(INTERN.toneOf("nope"), "");
  INTERN.setGroups([]); // 空的不動
  assert.equal(INTERN.SLOT_ORDER.length, 3);
});

test("實習後台：分類一節（加、改、排順序、沒有格子才刪）、編輯頁六格", () => {
  const groups = [{ key: "onboard", seq: 1, name_zh: "入門", name_en: "Onboard" }, { key: "gx", seq: 2, name_zh: "空的", name_en: "Empty" }];
  setInternGroups(groups);
  const data = { terms: [{ id: "2026-27", title_zh: "這一屆", title_en: "T", active: true, starts_on: "2026-09-01", ends_on: "2027-07-31" }],
    tasks: [{ id: "T1", term: "2026-27", seq: 1, category: "onboard", title_zh: "a", title_en: "A", active: true }], stamped: {}, interns: 0, groups };
  const h = internAdminHTML(data, "2026-27", "", false, true, null, []);
  const sec = h.slice(h.indexOf('id="groups"'));
  assert.match(sec, /data-act="ig-new"/);
  assert.match(sec, /data-act="ig-del" data-key="gx"/); assert.doesNotMatch(sec, /data-act="ig-del" data-key="onboard"/);
  assert.match(sec, /data-act="ig-move" data-key="gx" data-dir="-1"/);
  const e = internGroupEditHTML(null, "", false);
  for (const id of ["ig-name-zh", "ig-name-en", "ig-tag-zh", "ig-tag-en", "ig-body-zh", "ig-body-en"]) assert.match(e, new RegExp(`id="${id}"`));
  assert.equal(INTERN_CATS.length, 2);
});

test("★ 自動存：打字的欄位停手 4 秒或離開那一格才存，九份一模一樣", () => {
  const files = ["settings/src/ui.js", "admin/people/src/ui.js", "admin/passports/src/ui.js", "admin/site/src/ui.js", "admin/finance/src/ui.js",
                 "passport/src/ui.js", "admin/src/ui.js", "intern-passport/src/ui.js", "availability/src/ui.js"];
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    assert.match(s, /export const TYPED_MS = 4000;/, f);
    assert.match(s, /debounce\(f => run\(box, f\), TYPED_MS\)/, f);
    assert.match(s, /addEventListener\("focusout"[^\n]*d\.flush/, f + " 離開那一格就存");
  }
});
