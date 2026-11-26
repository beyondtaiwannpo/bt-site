// 聯絡方式照連結歸類（2026-11-26）。跑法：node --test test/*.test.mjs
// Paul 貼著一條掛在 LinkedIn 底下的 facebook.com 連結：「this is obviously facebook then change it to facebook, check all others」。
// 正式站掛在 LinkedIn 底下的 120 筆裡只有 4 筆是 LinkedIn。資料由遷移檔搬一次，之後新加的由畫面那一支純函式歸類。
// 這一支守三件事：1. 畫面那一支的規則；2. 遷移檔只改種類、不碰 email 與電話、不是連結的不動；3. 兩邊認的是同一批網站。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contactKindFor, CONTACT_SITES, CONTACT_KINDS } from "../admin/records/src/ui.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const sql = read("supabase/migrations/2027-01-18-contact-kinds.sql").replace(/--[^\n]*/g, "");

test("★ 貼的是某個網站的連結就照那個網站歸類；不是連結的照選單選的", () => {
  assert.equal(contactKindFor("linkedin", "https://www.facebook.com/someone.0110"), "facebook");
  assert.equal(contactKindFor("linkedin", "m.facebook.com/someone"), "facebook");
  assert.equal(contactKindFor("website", "https://fb.me/someone"), "facebook");
  assert.equal(contactKindFor("linkedin", "https://instagram.com/someone/"), "ig");
  assert.equal(contactKindFor("facebook", "https://www.linkedin.com/in/someone"), "linkedin");
  assert.equal(contactKindFor("linkedin", "https://line.me/ti/p/abc"), "line");
  assert.equal(contactKindFor("linkedin", "https://wa.me/886900000000"), "whatsapp");
  assert.equal(contactKindFor("linkedin", "https://someone.example.com/me"), "website", "別的網址算網站");
  assert.equal(contactKindFor("linkedin", "https://www.linkedin.com/in/someone"), "linkedin");
  // 不是連結：看不出是哪裡的，照選的
  assert.equal(contactKindFor("linkedin", "Someone Name"), "linkedin");
  assert.equal(contactKindFor("line", "0912345678"), "line", "LINE 的 ID 可以是電話");
  assert.equal(contactKindFor("ig", "some_handle"), "ig");
  assert.equal(contactKindFor("linkedin", "notfacebook.community/x"), "linkedin", "只是字裡面有 facebook 不算");
  // email 與電話不改
  assert.equal(contactKindFor("email", "someone@facebook.com"), "email");
  assert.equal(contactKindFor("phone", "https://wa.me/886900000000"), "phone");
  // 選的本來就是網站：別的網址照舊；空的照舊
  assert.equal(contactKindFor("website", "https://someone.example.com"), "website");
  assert.equal(contactKindFor("linkedin", ""), "linkedin");
  for (const [k] of CONTACT_SITES) assert.ok(CONTACT_KINDS.includes(k), k + " 是畫面上有的種類");
});

test("★ 遷移檔與畫面認的是同一批網站", () => {
  // 遷移檔：when i.value ~* '\m(facebook\.com|fb\.com|fb\.me)\M' then 'facebook'
  const fromSql = [...sql.slice(0, sql.indexOf("commit;")).matchAll(/when i\.value ~\* '\\m\(?([^']*?)\)?\\M' then '([a-z]+)'/g)].map(m => [m[2], m[1].split("|").map(x => x.replace(/\\\./g, ".")).sort().join(",")]);
  const fromJs = CONTACT_SITES.map(([k, re]) => [k, re.source.replace(/^\\b\(?/, "").replace(/\)?\\b$/, "").split("|").map(x => x.replace(/\\\./g, ".")).sort().join(",")]);
  assert.deepEqual(fromSql, fromJs, "種類、順序、每一種認的網域都要一樣");
  assert.equal(fromSql.length, 5);
  assert.match(sql, /when i\.value ~\* '\^\\s\*\(https\?:\/\/\|www\\\.\)' then 'website'/, "其他網址算網站");
});

test("★ 遷移檔：只改種類，不碰 email 與電話，不是連結的不動，別人已經有的不搬，每一筆留紀錄", () => {
  const blk = sql.slice(sql.indexOf("do $$"), sql.indexOf("commit;"));
  assert.match(blk, /where i\.kind in \('linkedin', 'facebook', 'website', 'ig', 'line', 'wechat', 'whatsapp'\)/);
  assert.doesNotMatch(blk, /'email'|'phone'/, "email 與電話不在掃的範圍裡");
  assert.match(blk, /if r\.seen is null or r\.seen = r\.kind then continue; end if;/, "認不出來的不動");
  assert.match(blk, /v_new := public\.rc_contact_norm\(r\.seen, r\.value\);/, "照那一種原本的規則收（Instagram 收成帳號）");
  assert.match(blk, /if v_hit\.person_id = r\.person_id then[\s\S]*?delete from public\.rc_identities where id = r\.id;/, "同一個人已經有對的那一筆：掛錯的拿掉");
  assert.match(blk, /else[\s\S]*?v_taken := v_taken \+ 1;\s*end if;\s*continue;/, "別人已經有的不搬");
  assert.match(blk, /update public\.rc_identities set kind = r\.seen, value = v_new where id = r\.id;/);
  assert.equal((blk.match(/perform public\.rc_log_it\('contact_kind_fix'/g) || []).length, 2, "改的與拿掉的都留紀錄");
  assert.doesNotMatch(blk, /person_id =(?! r\.person_id)/, "是誰的不動");
  assert.doesNotMatch(sql, /create (or replace )?function|alter table|create policy|grant /i, "沒有新的函式、表、政策、權限");
  assert.match(read("scripts/db/smoke.sh"), /CKM=supabase\/migrations\/2027-01-18-contact-kinds\.sql/, "smoke.sh 有跑這一支");
});

test("主程式：加聯絡方式先歸類再存，歸到別種會講一聲", () => {
  const m = read("admin/records/src/main.js");
  assert.match(m, /const kind = UI\.contactKindFor\(v\.kind, v\.value\);\s*const ok = await run\("err\.save", \(\) => D\.addContact\(S\.id, kind, v\.value\)\);/);
  assert.match(m, /S\.msg = kind === v\.kind \? T\("msg\.saved"\) : T\("msg\.contactAs", \{ kind: T\("ckind\." \+ kind\) \}\);/);
  assert.match(read("admin/records/src/strings.js"), /"msg\.contactAs":/);
});
