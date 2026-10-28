// 自動儲存的純函式（2026-11-06）。四個後台 ui.js 各一份一模一樣（admin-hub.test 逐字比對），
// settings、passport、intern-passport、availability 的 main.js 也各一份；這裡只測 admin/ 那一份的行為。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as UI from "../admin/src/ui.js";
import * as AUTH from "../shared/auth.js";

test("debounce：連續叫只跑最後一次，flush 立刻跑，cancel 不跑", async () => {
  let n = 0, last = null;
  const d = UI.debounce(v => { n++; last = v; }, 20);
  d(1); d(2); d(3);
  assert.equal(n, 0);
  await new Promise(r => setTimeout(r, 40));
  assert.equal(n, 1); assert.equal(last, 3);
  d(4); d.flush(5); assert.equal(n, 2); assert.equal(last, 5);
  d(6); d.cancel(); await new Promise(r => setTimeout(r, 40)); assert.equal(n, 2);
});

test("saveMode：選的馬上存，打字的等一下，沒標 data-autosave 的不管", () => {
  const el = (tag, type, inside = true) => ({ tagName: tag, type: type || "", closest: s => inside ? { dataset: { autosave: "x" } } : null, dataset: {} });
  assert.equal(UI.saveMode(el("SELECT")), "now");
  assert.equal(UI.saveMode(el("INPUT", "checkbox")), "now");
  assert.equal(UI.saveMode(el("INPUT", "radio")), "now");
  assert.equal(UI.saveMode(el("INPUT", "date")), "now");
  assert.equal(UI.saveMode(el("INPUT", "text")), "typed");
  assert.equal(UI.saveMode(el("INPUT", "")), "typed");
  assert.equal(UI.saveMode(el("TEXTAREA")), "typed");
  assert.equal(UI.saveMode(el("INPUT", "text", false)), null, "不在 data-autosave 容器裡的不自動存");
  assert.equal(UI.saveMode({ tagName: "INPUT", type: "text", dataset: { noauto: "1" }, closest: () => ({ dataset: { autosave: "x" } }) }), null, "data-noauto 的欄位不自動存");
});

test("dirtyTracker：同一格同一個值不重存，存過之後 mark，forget 之後又算髒", () => {
  const d = UI.dirtyTracker();
  assert.equal(d.changed("a", "1"), true);
  d.mark("a", "1");
  assert.equal(d.changed("a", "1"), false);
  assert.equal(d.changed("a", "2"), true);
  d.forget("a");
  assert.equal(d.changed("a", "1"), true);
});

test("formValues：把容器裡每一格讀成 { name: value }，checkbox 是布林，radio 取選到的", () => {
  const fields = [
    { name: "title", type: "text", value: " 嘖嘖 ", tagName: "INPUT" },
    { name: "open", type: "checkbox", checked: true, tagName: "INPUT" },
    { name: "kind", type: "radio", value: "a", checked: false, tagName: "INPUT" },
    { name: "kind", type: "radio", value: "b", checked: true, tagName: "INPUT" },
    { name: "note", type: "", value: "x", tagName: "TEXTAREA" },
    { name: "", type: "text", value: "no name", tagName: "INPUT" },
  ];
  const v = UI.formValues({ querySelectorAll: () => fields });
  assert.deepEqual(v, { title: "嘖嘖", open: true, kind: "b", note: "x" });
});

test("版本比較：載進來的跟線上不一樣才提醒，空的不提醒", () => {
  assert.equal(UI.versionDiffers("2026-11-06-1200", "2026-11-06-1300"), true);
  assert.equal(UI.versionDiffers("2026-11-06-1200", "2026-11-06-1200"), false);
  assert.equal(UI.versionDiffers("", "2026-11-06-1300"), false);
  assert.equal(UI.versionDiffers("2026-11-06-1200", undefined), false);
});

test("prefetchTargets：別的資料夾的連結給 HTML 加四支模組，同一頁的 #tab 不預取", () => {
  assert.deepEqual(UI.prefetchTargets("#forms"), []);
  const t = UI.prefetchTargets("../people/?lang=zh#roster");
  assert.equal(t[0], "../people/");
  assert.equal(t.length, 5);
  assert.ok(t.includes("../people/src/ui.js"), "沒有 meta 的時候不帶版本號");
});

test("「我是誰」的分頁快取：對的人、十分鐘內、有那一列才算數", () => {
  const now = 1_000_000;
  assert.equal(AUTH.meCacheValid({ id: "u1", at: now - 1000, row: { role: "cadre" } }, "u1", now), true);
  assert.equal(AUTH.meCacheValid({ id: "u2", at: now - 1000, row: { role: "cadre" } }, "u1", now), false, "換一個人登入不能用上一個人的");
  assert.equal(AUTH.meCacheValid({ id: "u1", at: now - 11 * 60 * 1000, row: { role: "cadre" } }, "u1", now), false, "十分鐘過期");
  assert.equal(AUTH.meCacheValid({ id: "u1", at: now - 1000, row: null }, "u1", now), false);
  assert.equal(AUTH.meCacheValid(null, "u1", now), false);
});

test("★ signOut 會清掉分頁快取；settings 與 app 存完資料會清", () => {
  const auth = readFileSync("shared/auth.js", "utf8");
  assert.match(auth, /export async function signOut\(\) \{ forgetMe\(\);/);
  assert.match(readFileSync("settings/src/main.js", "utf8"), /AUTH\.forgetMe\(\)/);
  assert.match(readFileSync("app/src/main.js", "utf8"), /AUTH\.forgetMe\(\)/);
  assert.match(readFileSync("availability/src/main.js", "utf8"), /AUTH\.forgetMe\(\)/);
});

test("★ 四個後台 main.js 開頁先畫外殼（paintShell）再等資料，不再一個接一個 await", () => {
  for (const f of ["admin/src/main.js", "admin/site/src/main.js", "admin/people/src/main.js", "admin/passports/src/main.js", "admin/finance/src/main.js"]) {
    const s = readFileSync(f, "utf8");
    assert.match(s, /function paintShell\(/, f);
    assert.match(s, /paintShell\(/, f);
    assert.match(s, /UI\.checkVersion\(/, f);
  }
  const hub = readFileSync("admin/src/main.js", "utf8");
  assert.match(hub, /Promise\.all\(\[\s*formsP, pendingP,\s*D\.loadTeams\(\)/, "總覽六樣東西要一起等");
  const bootSrc = hub.slice(hub.indexOf("async function boot("), hub.indexOf("function evTeams("));
  assert.doesNotMatch(bootSrc, /S\.todo = await D\.loadTodo/, "開頁不要再排隊");
});

test("★ 四個後台 index.html 一開始就有骨架側欄，importmap 與 meta 版本在", () => {
  for (const f of ["admin/index.html", "admin/site/index.html", "admin/people/index.html", "admin/passports/index.html", "admin/finance/index.html"]) {
    const h = readFileSync(f, "utf8");
    assert.match(h, /<nav class="rail skel"/, f);
    assert.match(h, /<meta name="bt-version" content="[^"]+">/, f);
    assert.match(h, /<script type="importmap">/, f);
    assert.match(h, /src="\.\/src\/main\.js\?v=/, f);
  }
});

// 2026-10-28：/admin/site/ 的 onAutosave 少收 field，函式裡卻用了 field，
// 一選「寄哪一種語言」就丟 ReferenceError，什麼都沒存，畫面也不報錯。
// 九份 onAutosave 只要函式本體提到 field，參數就一定要有 field。
test("onAutosave 用到 field 就一定要收 field", () => {
  const dirs = ["admin", "admin/site", "admin/people", "admin/passports", "admin/finance", "passport", "intern-passport", "settings", "availability"];
  for (const d of dirs) {
    let src; try { src = readFileSync(new URL(`../${d}/src/main.js`, import.meta.url), "utf8"); } catch { continue; }
    const m = src.match(/async function onAutosave\(([^)]*)\)\s*\{([\s\S]*?)\n\}/);
    if (!m) continue;
    const params = m[1].split(",").map(s => s.trim());
    if (/\bfield\b/.test(m[2])) assert.ok(params.includes("field"), `${d}/src/main.js 的 onAutosave 用了 field 卻沒收`);
  }
});
