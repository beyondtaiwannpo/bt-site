// 幹部護照存檔（2026-10-25 Alice 回報「按儲存欄位清空、沒存」）。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeProfile } from "../passport/src/data.js";

test("★ profiles 那一列在就組得出 profile，passports 那一列不在也不會變成 null（不然畫面一直停在申請表）", () => {
  const pf = { id: "u1", name_zh: "潘荐綾", name_en: "Alice", team: "Curriculum Team", role: "cadre", avatar: null, tz: "Asia/Taipei" };
  const p = mergeProfile("u1", pf, null);
  assert.ok(p, "沒有 passports 列也要有 profile");
  assert.equal(p.name_zh, "潘荐綾"); assert.equal(p.motto, null); assert.equal(p.issued, null);
  const q = mergeProfile("u1", pf, { motto: "一句話", issued: "2026-10-01", intro_seen: true });
  assert.equal(q.motto, "一句話"); assert.equal(q.intro_seen, true);
  assert.equal(mergeProfile("u1", null, { motto: "x" }), null, "profiles 那一列不在才是真的沒有這個人");
});

test("★ 存檔兩句 update 都把影響的列拿回來；0 列丟看得懂的錯；passports 0 列先補一列再存一次", () => {
  const d = readFileSync("passport/src/data.js", "utf8");
  const body = d.slice(d.indexOf("export async function saveProfile"), d.indexOf("\n}", d.indexOf("export async function saveProfile")));
  assert.match(body, /from\("profiles"\)\.update\(\{[\s\S]*?\}\)\.eq\("id", user\.id\)\.select\("id"\)/, "profiles 的 update 要 select 回來");
  assert.match(body, /throw new Error\("profile_missing"\)/);
  assert.match(body, /from\("passports"\)\.update\(\{[\s\S]*?\}\)\.eq\("id", user\.id\)\.select\("id"\)/, "passports 的 update 要 select 回來");
  assert.match(body, /await ensurePassport\(\);/, "0 列先補一列");
  assert.match(body, /throw new Error\("passport_missing"\)/);
  assert.match(d, /rpc\("ensure_passport"\)/);
  assert.match(d, /hasPassport: !!pa\.data/);
});

test("開頁：幹部有 profiles 沒 passports 就先補一列再讀一次；存失敗的 toast 分三種", () => {
  const m = readFileSync("passport/src/main.js", "utf8");
  assert.match(m, /all\.role === "cadre" && all\.profile && !all\.hasPassport && !S\.healed/);
  assert.match(m, /await DATA\.ensurePassport\(\); all = await DATA\.loadAll\(\);/);
  assert.match(m, /m === "profile_missing" \? T\("m\.noProfileRow"\) : m === "passport_missing" \? T\("m\.noPassportRow"\) : T\("m\.notSaved"\)/);
  const s = readFileSync("passport/src/strings.js", "utf8");
  assert.match(s, /"m\.noProfileRow":\s*\{ zh: "[^"]+", en: "[^"]+" \}/, "m.noProfileRow 要 zh+en");
  assert.match(s, /"m\.noPassportRow":\s*\{ zh: "[^"]+", en: "[^"]+" \}/, "m.noPassportRow 要 zh+en");
});

test("★ 遷移檔：補每一位幹部的 passports 列、ensure_passport() 只給幹部、印沒有 profiles 的帳號數", () => {
  const sql = readFileSync("supabase/migrations/2026-11-04-passport-self-heal.sql", "utf8");
  assert.match(sql, /insert into passports \(id\)\s*select p\.id from profiles p where p\.role = 'cadre' and not exists/);
  assert.match(sql, /create or replace function public\.ensure_passport\(\)[\s\S]*security definer/);
  assert.match(sql, /return 'not_cadre'/); assert.match(sql, /return 'exists'/); assert.match(sql, /return 'created'/);
  assert.match(sql, /grant execute on function public\.ensure_passport\(\) to authenticated/);
  assert.match(sql, /from auth\.users u where not exists \(select 1 from public\.profiles p where p\.id = u\.id\)/);
  const smoke = readFileSync("scripts/db/smoke.sh", "utf8");
  assert.match(smoke, /2026-11-04-passport-self-heal\.sql/);
  assert.match(smoke, /同一個人更新 passports 影響 0 列而且沒有錯/, "smoke 先重現再修");
});
