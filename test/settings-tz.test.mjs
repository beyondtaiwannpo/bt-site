// 時區設定搬到設定頁（2026-11-08，Paul：「把時區從看板搬到設定」）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { settingsHTML, tzHTML, tzListHTML, searchTz, setLang } from "../settings/src/ui.js";
import * as AVAIL from "../availability/src/ui.js";

setLang("zh");
const CADRE = { id: "u1", role: "cadre", email: "c@x.io", name_zh: "小安", name_en: "Ann", tz: "America/Detroit", ws: {} };

test("★ 幹部的設定頁有時區那一區，印現在的時區與「改」；學員、校友、實習生沒有", () => {
  const h = settingsHTML(CADRE, "", false, null, []);
  assert.match(h, /<h3 class="sec-h">時區<\/h3>/);
  assert.match(h, /你在：底特律 \/ Detroit/); assert.match(h, /data-act="tz-change">改</);
  assert.doesNotMatch(h, /id="tzq"/, "沒按「改」之前不出現搜尋框");
  for (const role of ["student", "alumni", "intern"]) assert.doesNotMatch(settingsHTML({ ...CADRE, role }, "", false, null, []), /data-act="tz-change"/, role);
});

test("還沒設時區：說清楚看板要它，按鈕叫「設定」；按了之後有猜測、搜尋框、清單", () => {
  const none = tzHTML({ ...CADRE, tz: null }, null);
  assert.match(none, /還沒設定/); assert.match(none, /data-act="tz-change">設定</);
  const edit = tzHTML({ ...CADRE, tz: null }, { edit: true, guess: "Asia/Taipei", q: "", results: [] });
  assert.match(edit, /看起來你在 <b>台北 \/ Taipei<\/b>/); assert.match(edit, /data-act="tz-pick" data-tz="Asia\/Taipei"/);
  assert.match(edit, /id="tzq"/); assert.doesNotMatch(edit, /tz-cancel/, "沒有時區就不能「不改了」");
  const same = tzHTML(CADRE, { edit: true, guess: "America/Detroit", q: "", results: [] });
  assert.doesNotMatch(same, /看起來你在/, "猜到的跟現在一樣就不用再問"); assert.match(same, /tz-cancel/);
});

test("搜尋清單：有結果一列一顆、沒結果說找不到、沒打字就空白；搜尋跟看板同一份別名", () => {
  const rs = searchTz("Ann Arbor");
  assert.equal(rs[0].tz, "America/Detroit");
  assert.match(tzListHTML(rs, "Ann Arbor"), /data-act="tz-pick" data-tz="America\/Detroit"/);
  assert.match(tzListHTML([], "zzz"), /找不到「zzz」/);
  assert.equal(tzListHTML([], ""), "");
  const a = readFileSync("availability/src/tz-alias.js", "utf8"), b = readFileSync("settings/src/tz-alias.js", "utf8");
  const from = s => s.slice(s.indexOf("export const TZ_ALIAS"));
  assert.equal(from(a), from(b), "兩份別名要一模一樣（check.sh 也守）");
});

test("★ 看板不再有「改時區」的按鈕，改成連到設定頁；第一次沒時區的那一張還在", () => {
  const ui = readFileSync("availability/src/ui.js", "utf8"), main = readFileSync("availability/src/main.js", "utf8");
  assert.doesNotMatch(ui, /data-act="change-tz"/); assert.doesNotMatch(main, /act === "change-tz"/);
  assert.match(ui, /href="\.\.\/settings\/"/);
  assert.match(AVAIL.tzSetupHTML("Asia/Taipei", "", [], ""), /id="tzq"/);
  const sm = readFileSync("settings/src/main.js", "utf8");
  for (const act of ["tz-change", "tz-cancel", "tz-pick"]) assert.match(sm, new RegExp(`act === "${act}"`), act);
  assert.match(sm, /forgetMe\(\)/, "存完要清「我是誰」的快取，看板才讀得到新時區");
});
