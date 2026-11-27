// 個人連結填完就有帳號，而且就是名單上那一個人（2027-01-25，supabase/migrations/2027-01-25-profile-link-account.sql）。
// Paul 2026-11-27：「once they fill out the form, they should get their account」「I don't want… two person. No, it's that account.」
// 資料庫那一半在 scripts/db/smoke.sh 的同名一段（認領、撞到另一個人、破壞測試）；這裡守畫面與程式的形狀。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as P from "../profile/src/ui.js";
import { featuresFor, FEATURES } from "../shared/nav.js";
import { settingsHTML, setLang as settingsLang } from "../settings/src/ui.js";
import { MAIL_KINDS, mailButtonLabel, MAIL_SAMPLE_URL, setLang as siteLang } from "../admin/site/src/ui.js";
import { T as peopleT, setLang as peopleLang } from "../admin/people/src/strings.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const live = s => s.replace(/^\s*--.*$/gm, "").replace(/^\s*\/\/.*$/gm, "");
const CODE = "bt-0a1b2c3d";

test("存好之後「你的帳號」：寄出了、馬上開的那顆鈕連到 /app/?invite=碼、說用哪個 email", () => {
  for (const en of [false, true]) {
    const h = P.accountHTML({ state: "invited", email: "ann@example.com", code: CODE, sent: true }, en);
    assert.match(h, /<section class="pf-acc"/);
    assert.match(h, en ? /href="\.\.\/app\/\?invite=bt-0a1b2c3d&amp;lang=en"/ : /href="\.\.\/app\/\?invite=bt-0a1b2c3d&amp;lang=zh"/);
    assert.equal((h.match(/ann@example\.com/g) || []).length, 2, "信寄到哪、用哪個登入，兩句都講");
    assert.match(h, en ? /We sent an email/ : /我們寄了一封信/);
    const again = P.accountHTML({ state: "invited", email: "ann@example.com", code: CODE, sent: false }, en);
    assert.match(again, en ? /already sent/ : /之前寄過/);
  }
});

test("★ 開帳號的鈕只收資料庫發的那種碼；email 一律跳脫", () => {
  for (const bad of ["bt-XYZ", "javascript:alert(1)", "bt-0a1b2c3d&x=1", "", null]) {
    const h = P.accountHTML({ state: "invited", email: "a@b.co", code: bad }, false);
    assert.doesNotMatch(h, /invite=/, String(bad));
  }
  const h = P.accountHTML({ state: "invited", email: "<img src=x onerror=1>@b.co", code: CODE }, true);
  assert.doesNotMatch(h, /<img/); assert.match(h, /&lt;img/);
});

test("另外五種情況各有一句，有帳號與撞到帳號的叫他登入；登入的人自己不畫這一塊", () => {
  for (const en of [false, true]) {
    for (const st of ["has_account", "login"]) assert.match(P.accountHTML({ state: st, email: "a@b.co" }, en), /href="\.\.\/app\/"/, st);
    assert.match(P.accountHTML({ state: "pending" }, en), /mailto:beyondtaiwan2020@gmail\.com/);
    assert.match(P.accountHTML({ state: "no_email" }, en), en ? /add an email/ : /留一個 email/);
    assert.match(P.accountHTML({ state: "error", code: "too_many" }, en), en ? /Your profile is saved/ : /檔案已經存好了/);
    for (const st of ["has_account", "login", "pending", "no_email", "error"]) assert.doesNotMatch(P.accountHTML({ state: st, code: CODE }, en), /invite=/, st);
  }
  assert.equal(P.accountHTML({ state: "self" }, false), "");
  assert.equal(P.accountHTML(null, true), "");
});

test("存好那一頁：帳號那一塊在最上面；登入的人看到的是「登入之後回到這一頁」，不是連結的期限", () => {
  const s = Object.assign(P.blank(), { name_en: "Ann" });
  const h = P.doneHTML(s, { expires_at: "2027-03-01T00:00:00Z", account: { state: "invited", email: "a@b.co", code: CODE } }, false);
  assert.ok(h.indexOf("pf-acc") < h.indexOf(P.t("doneLead", false)), "帳號在「BT 現在有的是這些」前面");
  const self = P.doneHTML(s, { expires_at: "2027-03-01T00:00:00Z", self: true, account: { state: "self" } }, true);
  assert.match(self, /sign in and come back to this page/);
  assert.doesNotMatch(self, /keeps working until|open this same link/);
  assert.doesNotMatch(self, /pf-acc/);
});

test("登入的人：表單最上面一行說他登入了、兩條路回設定與活動；第五步那一句也換成登入", () => {
  const s = P.blank();
  const f = P.formHTML(s, { step: 1, en: false, meta: { self: true } });
  assert.match(f, /class="pf-h pf-self"/); assert.match(f, /href="\.\.\/settings\/"/); assert.match(f, /href="\.\.\/events\/"/);
  assert.doesNotMatch(P.formHTML(s, { step: 1, en: false, meta: {} }), /pf-self/, "拿連結的人沒有這一行");
  const last = P.formHTML(s, { step: P.STEPS.length, en: true, meta: { self: true } });
  assert.match(last, /sign in and come back to this page/); assert.doesNotMatch(last, /open this same link again/);
});

test("連結打不開：多一句可以登入；登入了卻拿不到自己的那一份：幹部指去設定，其他人寫信給 BT。都沒有表單", () => {
  for (const en of [false, true]) {
    assert.match(P.wrongLinkHTML(en), /href="\.\.\/app\/"/);
    const cadre = P.noMineHTML(en, "not_for_cadre"), none = P.noMineHTML(en, "no_record");
    assert.match(cadre, /href="\.\.\/settings\/"/); assert.match(none, /mailto:beyondtaiwan2020@gmail\.com/);
    assert.doesNotMatch(cadre + none, /<form|<input|<button/);
  }
});

test("★ /profile/：登入的那一條只放在記憶體；存完才開帳號；開帳號失敗不算沒存", () => {
  const main = live(read("profile/src/main.js"));
  assert.match(main, /supabase\.rpc\("rc_my_profile_link"\)/);
  assert.match(main, /supabase\.auth\.getSession\(\)/, "只看這台瀏覽器有沒有登入");
  assert.doesNotMatch(main, /signIn|signOut|signUp|onAuthStateChange/, "這一頁不做登入這件事，登入在 /app/");
  assert.match(main, /supabase\.rpc\("rc_public_profile_account", \{ p_token: token\(\), p_lang: isEn\(\) \? "en" : "zh" \}\)/);
  assert.ok(main.indexOf("rc_public_profile_account") > main.indexOf('rpc("rc_public_profile_save"'));
  assert.match(main, /S\.account = S\.self \? \{ state: "self" \} : await accountFor\(\);/);
  // accountFor 自己吞掉錯誤，回 { state: "error" }：上面那一句不會跳進「沒存進去」那一段。
  const fn = main.slice(main.indexOf("async function accountFor"), main.indexOf("async function mine"));
  assert.match(fn, /catch \(e\) \{[\s\S]*return \{ state: "error", code \};/);
  assert.match(main, /const token = \(\) => urlToken\(\) \|\| S\.tok;/);
  for (const line of main.split("\n").filter(l => /S\.tok/.test(l))) assert.doesNotMatch(line, /history|location|Storage|console|href/, line.trim());
});

test("★ /app/：BT 的朋友登入直接進 /profile/；帳號已經是名單上另一個人，講一句、碼收掉", () => {
  const main = live(read("app/src/main.js"));
  assert.match(main, /if \(S\.role === "connection"\) \{[\s\S]{0,120}location\.replace\("\.\.\/profile\/"\);/);
  assert.match(main, /if \(data === "record_conflict"\) \{ dropInvite\(\); S\.authMsg = T\("inv\.recordConflict"\); return false; \}/);
  const str = read("app/src/strings.js");
  assert.match(str, /"inv\.recordConflict":\{ zh: "[^"]+", en: "[^"]+" \}/);
});

test("頂欄：BT 的朋友只有我的檔案與設定，沒有任何幹部的東西", () => {
  assert.deepEqual(featuresFor("connection").map(f => f.key), ["myprofile", "settings"]);
  const mp = FEATURES.find(f => f.key === "myprofile");
  assert.equal(mp.href, "/profile/"); assert.deepEqual(mp.roles, ["connection"]);
  for (const r of ["cadre", "student", "alumni", "intern"]) assert.ok(!featuresFor(r).some(f => f.key === "myprofile"), r);
});

test("設定：BT 的朋友是名字兩格、一條路去我的檔案、可以刪帳號，沒有大頭照（照片由 BT 在紀錄裡放）", () => {
  for (const lang of ["zh", "en"]) {
    settingsLang(lang);
    const h = settingsHTML({ id: "u1", role: "connection", email: "a@b.co", name_zh: "安", name_en: "Ann" }, "", false, null);
    assert.match(h, /id="nzh"/); assert.match(h, /id="nen"/);
    assert.match(h, /href="\.\.\/profile\/"/);
    assert.match(h, /data-act="ask-delete"/);
    assert.doesNotMatch(h, /data-act="avatar"|id="school"|id="grade"/);
  }
  settingsLang("zh");
  const set = live(read("settings/src/main.js"));
  assert.match(set, /\} else if \(alumni \|\| intern \|\| friend\) \{/, "存名字走校友與實習生那一句");
});

test("信件文案：開帳號那一封列得出來、按鈕的字與範例連結都在，代換符號跟邀請信同一套", () => {
  siteLang("zh");
  assert.ok(MAIL_KINDS.some(k => k.v === "profile_account"));
  assert.equal(mailButtonLabel("profile_account", "zh"), "開我的帳號");
  assert.equal(mailButtonLabel("profile_account", "en"), "Set up my account");
  assert.match(MAIL_SAMPLE_URL.profile_account, /\/app\/\?invite=/);
  const ui = read("admin/site/src/ui.js");
  assert.match(ui, /const isInvite = kind === "invite" \|\| isAccount/);
});

test("人與權限的邀請清單：個人連結的碼標成 BT 的朋友，不是校友", () => {
  for (const lang of ["zh", "en"]) {
    peopleLang(lang);
    for (const k of ["role.connection", "grant.connection", "in.who.connection"]) assert.ok(peopleT(k) && peopleT(k) !== k, k + " " + lang);
  }
  peopleLang("zh");
  assert.match(read("admin/people/src/ui.js"), /r\.grants === "connection" \? T\("in\.who\.connection"\)/);
});

test("★ 遷移檔：檔頭引 Paul、begin/commit、不新增也不刪除名單上的人、門開對人", () => {
  const raw = read("supabase/migrations/2027-01-25-profile-link-account.sql"), sql = live(raw);
  assert.match(raw.split("\n")[0], /^-- 個人連結填完/);
  assert.match(raw, /I don't want them to be creating another account or another person/);
  assert.match(sql, /^begin;$/m); assert.match(sql, /^commit;$/m);
  assert.match(raw, /OVERALL/);
  const body = name => { const i = sql.indexOf("function public." + name + "("); return sql.slice(i, sql.indexOf("$$;", sql.indexOf("$$", i) + 2)); };
  for (const fn of ["rc_claim_connection", "rc_public_profile_account", "rc_my_profile_link"]) {
    assert.doesNotMatch(body(fn), /insert into public\.people|delete from public\.people|insert into people|delete from people/, fn);
  }
  assert.match(sql, /grant execute on function public\.rc_public_profile_account\(text, text\) to anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.rc_my_profile_link\(\) to authenticated;/);
  assert.match(sql, /revoke all on function public\.rc_claim_connection\(text\) from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy|drop policy|alter policy/i, "沒有動任何一條 RLS 政策");
  // claim_invite：connection 的碼在「幹部直接回」之前就交出去，否則幹部那一列會被當成另一個人
  const ci = body("claim_invite");
  assert.ok(ci.indexOf("rc_claim_connection(p_code)") < ci.indexOf("already_cadre"));
  // 跟 smoke 的破壞測試對得上的那三句要在
  assert.match(sql, /token = p_token and submitted_at is not null\) then/);
  assert.match(sql, /update public\.people set profile_id = v_uid where id = pe\.id and profile_id is null;/);
});
