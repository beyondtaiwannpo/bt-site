// 每一支頁面模組都真的 import 一次：只看會不會是 SyntaxError（import three 失敗是正常的，node 沒有 three）。
// 2026-11-18 批 E：rides.js 一句行尾註解把同一行後面的程式吞掉，944 條測試與 check.sh 都沒抓到，頁面整個開不起來、還推上了 main。這一條守著。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

const files = [];
for (const dir of ["history/src", "island/src", "stories/src", "shared"]) { try { for (const f of readdirSync(new URL("../" + dir + "/", import.meta.url))) if (f.endsWith(".js")) files.push(dir + "/" + f); } catch { /* 沒有這個資料夾就跳過 */ } }

test("頁面模組都解析得過（" + files.length + " 支）", async () => {
  assert.ok(files.length > 10);
  for (const f of files) {
    try { await import(new URL("../" + f, import.meta.url)); }
    catch (e) { assert.ok(!(e instanceof SyntaxError), f + " 有語法錯誤：" + e.message); }
  }
});
