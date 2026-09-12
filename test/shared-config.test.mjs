// 金鑰只有一份（2026-09-11）。
// /alumni/ 是對外頁面，不載 supabase 套件，但它要連資料庫就需要那兩個常數。
// 所以常數搬進一支自己不 import 任何東西的小檔，兩邊都從它拿。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../shared/supabase-config.js";

const cfg = readFileSync(new URL("../shared/supabase-config.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../shared/supabase.js", import.meta.url), "utf8");

// ⚠ 這是這支檔案存在的唯一理由。它一旦 import 了 vendor/supabase-js.js，
// /alumni/ 就會跟著把整包套件載進來，那正是我們在避免的事。
test("★ supabase-config.js 不 import 任何東西", () => {
  assert.equal(/^\s*import\s/m.test(cfg), false, "config 裡出現了 import");
});

test("兩個常數都是非空字串，而且長得像 Supabase 的值", () => {
  assert.match(SUPABASE_URL, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.match(SUPABASE_PUBLISHABLE_KEY, /^sb_publishable_/);
});

// 金鑰有兩份的話，換專案時漏改一份的表現是「校友名單安靜地空掉」。
test("★ shared/supabase.js 不再自己寫死金鑰，是從 config 拿", () => {
  assert.match(client, /from "\.\/supabase-config\.js"/);
  assert.equal(/sb_publishable_/.test(client), false, "supabase.js 裡還有寫死的金鑰");
});
