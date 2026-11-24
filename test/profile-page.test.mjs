// /profile/ 個人連結的填寫頁（2027-01-03，遷移檔 2027-01-03-people-network.sql）：profile/src/ui.js 的純函式與 HTML 外殼。
// 資料全是假的（public repo，不放真人的名字）。★ 是資料庫的規矩要前端配合的那幾條，壞了會刪到別人的資料或收回別人的同意。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as P from "../profile/src/ui.js";

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const ID1 = "11111111-1111-4111-8111-111111111111", ID2 = "22222222-2222-4222-8222-222222222222", ID3 = "33333333-3333-4333-8333-333333333333";
// rc_public_profile 回的形狀
const SERVER = {
  person: { name_zh: "測試講者", name_en: "Test Speaker", school: "Example Senior High School" },
  profile: { photo_url: null, city: "Madison", country: "USA", job_title: "Engineer", job_org: "Example Corp", field: "Robotics", bio: "A short bio.",
             story: { turning: "A fake turning point." }, offer_speak: true, offer_mentor: false, contact_ok: false, share_profile: false, share_story: true,
             consent_at: "2027-01-01T00:00:00Z", done_at: "2027-01-01T00:00:00Z", updated_at: "2027-01-01T00:00:00Z" },
  contacts: { email: "speaker@example.com", phone: "+1 608 555 0100" },
  education: [{ id: ID1, kind: "graduated", institution: "Example University", major: "Physics", title: "BSc", year: 2019 },
              { id: ID2, kind: "enrolled", institution: "Example Institute", major: "Robotics", title: "PhD", year: 2028 }],
  career: [{ id: ID3, institution: "Old Example Ltd", title: "Intern", year: 2018 }],
  events: [{ title_zh: "寒假探索營（假）", title_en: "Winter Camp (fake)", starts_at: "2027-01-03T01:00:00Z" }],
  expires_at: "2027-04-03T00:00:00Z",
};
const NOW = "2026-12-20T00:00:00Z";
const metaOf = d => ({ events: d.events, photo_url: d.profile.photo_url, expires_at: d.expires_at, done_at: d.profile.done_at, now: NOW });
const allSteps = (state, en, extra) => [1, 2, 3, 4, 5].map(step => P.formHTML(state, Object.assign({ step, en, meta: metaOf(SERVER) }, extra || {}))).join("\n");

test("★ 送出去的那一份：每一段都在，載進來的每一列都帶著 id 送回去，五個勾都在", () => {
  const p = P.toPayload(Object.assign(P.fromServer(SERVER), { adult: true }));
  assert.deepEqual(Object.keys(p).sort(), ["adult", "career", "contact_ok", "contacts", "education", "name_en", "name_zh", "offer_mentor", "offer_speak", "profile", "school", "share_profile", "share_story", "story"]);
  assert.deepEqual(p.education, [
    { id: ID1, kind: "graduated", institution: "Example University", major: "Physics", title: "BSc", year: 2019 },
    { id: ID2, kind: "enrolled", institution: "Example Institute", major: "Robotics", title: "PhD", year: 2028 }]);
  assert.deepEqual(p.career, [{ id: ID3, institution: "Old Example Ltd", title: "Intern", year: 2018 }]);
  assert.deepEqual(p.profile, { city: "Madison", country: "USA", job_title: "Engineer", job_org: "Example Corp", field: "Robotics", bio: "A short bio." });
  assert.deepEqual(Object.keys(p.story), P.STORY_KEYS, "故事那一段六個鍵都送，資料庫才是整段換掉");
  assert.equal(p.story.turning, "A fake turning point.");
  for (const k of P.FLAGS) assert.equal(typeof p[k], "boolean", k + " 每一次都要送");
  assert.deepEqual(P.FLAGS.map(k => p[k]), [false, true, false, true, false]);
  assert.equal(p.adult, true); assert.equal(p.name_zh, "測試講者"); assert.equal(p.school, "Example Senior High School");
  // 完全空白的狀態也是整份：空的段落照送，資料庫才知道「這一段現在是空的」。
  const empty = P.toPayload(P.blank());
  assert.deepEqual(empty.education, []); assert.deepEqual(empty.career, []);
  assert.deepEqual(P.FLAGS.map(k => empty[k]), [false, false, false, false, false]);
});

test("★ 改別的格子、在別的步驟打字，都不會讓載進來的列少送", () => {
  let s = P.fromServer(SERVER);
  // 畫面上只有第一步的格子：讀回來之後學歷與經歷還在
  s = P.readForm([{ name: "name_en", type: "text", value: "Test Speaker II" }, { name: "contacts.line", type: "text", value: "fake-line" }, { name: "share_profile", type: "checkbox", checked: true, value: "on" }], s);
  s = P.readForm([{ name: "education.0.major", type: "text", value: "Applied Physics" }, { name: "education.0.enrolled", type: "checkbox", checked: true }, { name: "", value: "x" }, { name: "nope.0.evil", value: "x" }, { name: "__proto__.x", value: "x" }], s);
  const p = P.toPayload(s);
  assert.deepEqual(p.education.map(r => r.id), [ID1, ID2]); assert.deepEqual(p.career.map(r => r.id), [ID3]);
  assert.equal(p.education[0].major, "Applied Physics"); assert.equal(p.education[0].kind, "enrolled", "勾了還在念就是 enrolled");
  assert.equal(p.name_en, "Test Speaker II"); assert.equal(p.contacts.line, "fake-line"); assert.equal(p.share_profile, true);
  assert.equal(({}).x, undefined, "不認得的路徑不會寫進任何地方");
  // 把一列的學校名字清空不等於拿掉：id 還是送回去（資料庫看到空的學校名字會自己刪那一列），而且 validate 會先問他
  const cleared = P.setField(s, "education.1.institution", "");
  assert.deepEqual(P.toPayload(cleared).education.map(r => r.id), [ID1, ID2]);
  assert.equal(P.validate(cleared, 2).errors["education.1.institution"], "row_need_school");
});

test("★ 他按了拿掉的那一列不送；新加的列沒有 id；整列空白的新列不送", () => {
  let s = P.removeRow(P.fromServer(SERVER), "education", 0);
  assert.deepEqual(P.toPayload(s).education.map(r => r.id), [ID2], "拿掉的那一列不在送出去的清單裡，資料庫才會刪它");
  assert.deepEqual(P.toPayload(s).career.map(r => r.id), [ID3], "別的清單不受影響");
  s = P.removeRow(s, "career", 0);
  assert.deepEqual(P.toPayload(s).career, [], "全部拿掉送空陣列，不是不送那個鍵");
  assert.ok("career" in P.toPayload(s));
  s = P.addRow(P.addRow(s, "education"), "education");
  s = P.setField(s, "education.1.institution", " New Example College "); s = P.setField(s, "education.1.year", "2030");
  const edu = P.toPayload(s).education;
  assert.equal(edu.length, 2, "第三列整列空白，不送");
  assert.deepEqual(edu[1], { kind: "graduated", institution: "New Example College", major: "", title: "", year: 2030 });
  assert.ok(!("id" in edu[1]));
  // 年份不是四位數就送 null（validate 會先擋，這裡只是保險）
  assert.equal(P.toPayload(P.setField(s, "education.1.year", "20")).education[1].year, null);
  // 最多十列
  let many = P.blank(); for (let i = 0; i < 14; i++) many = P.addRow(many, "career");
  assert.equal(many.career.length, 10);
  assert.equal(P.removeRow(many, "nope", 0).career.length, 10);
});

test("★ 聯絡方式六種都送；清空的那一格送空字串（資料庫才會拿掉），沒有的也是空字串", () => {
  let s = P.fromServer(SERVER);
  s = P.setField(s, "contacts.phone", "   ");
  const c = P.toPayload(s).contacts;
  assert.deepEqual(Object.keys(c), ["email", "phone", "linkedin", "ig", "line", "website"]);
  assert.equal(c.phone, ""); assert.equal(c.email, "speaker@example.com"); assert.equal(c.linkedin, ""); assert.equal(c.website, "");
  assert.equal(P.toPayload(P.setField(s, "contacts.email", "")).contacts.email, "", "email 清空也照送空字串（資料庫不會因此刪掉它）");
});

test("★ 五個勾預設都沒勾；只有之前存過的才勾著；取消勾選就送 false", () => {
  const fresh = P.fromServer({ person: { name_en: "Test Guest" }, profile: {}, contacts: {}, education: [], career: [], events: [] });
  for (const k of P.FLAGS) assert.equal(fresh[k], false, k);
  const html = P.formHTML(fresh, { step: 5, en: true });
  assert.equal((html.match(/type="checkbox"/g) || []).length, 6, "五個勾加一個滿 18 歲");
  assert.doesNotMatch(html, / checked/, "沒有任何一個預先勾好");
  // 資料庫回的不是 true 就不算（字串 "true"、1、null 都不勾）
  const odd = P.fromServer({ person: {}, profile: { share_profile: "true", share_story: 1, contact_ok: null } });
  assert.deepEqual([odd.share_profile, odd.share_story, odd.contact_ok], [false, false, false]);
  // 之前存過的照樣勾著
  const again = P.fromServer(SERVER), h2 = P.formHTML(again, { step: 5, en: false, meta: metaOf(SERVER) });
  assert.match(h2, /name="share_story" checked/); assert.match(h2, /name="offer_speak" checked/);
  assert.doesNotMatch(h2, /name="share_profile" checked/); assert.doesNotMatch(h2, /name="contact_ok" checked/); assert.doesNotMatch(h2, /name="offer_mentor" checked/);
  assert.match(h2, /取消勾選再按儲存，就是收回/);
  // 取消勾選：送出去的是 false，不是少一個鍵
  const off = P.toPayload(P.readForm([{ name: "share_story", type: "checkbox", checked: false }], again));
  assert.equal(off.share_story, false); assert.equal(off.offer_speak, true);
  // 每一個勾各有一句說明，兩種語言都有；信箱與隱私政策在
  for (const en of [false, true]) {
    const h = P.formHTML(again, { step: 5, en });
    for (const k of P.FLAGS) { const [title, help] = P.CONSENT[k][en ? 1 : 0]; assert.ok(h.includes(P.esc(title)) && h.includes(P.esc(help)), k); }
    assert.match(h, /mailto:beyondtaiwan2020@gmail\.com/); assert.match(h, /href="\.\.\/privacy\/"/);
  }
});

test("★「我已滿 18 歲」永遠不預先勾，沒勾就存不了", () => {
  const s = P.fromServer(Object.assign({}, SERVER, { adult: true, profile: Object.assign({}, SERVER.profile, { adult: true }) }));
  assert.equal(s.adult, false);
  assert.doesNotMatch(P.formHTML(s, { step: 5, en: false }), /name="adult" checked/);
  const v = P.validate(s);
  assert.equal(v.ok, false); assert.equal(v.errors.adult, "adult_only"); assert.equal(v.step, 5);
  assert.match(P.formHTML(s, { step: 5, en: false, errors: v.errors }), /id="pf-adult-e" role="alert">要先勾「我已滿 18 歲」才能儲存。/);
  assert.match(P.formHTML(s, { step: 5, en: true, errors: v.errors }), /name="adult"[^>]*aria-invalid="true"/);
  // 只有真的 true 才算（"on"、1 都不算）
  for (const x of ["on", 1, "true", null]) assert.equal(P.setField(s, "adult", x).adult, false);
  const ok = P.setField(s, "adult", true);
  assert.equal(P.validate(ok).ok, true); assert.equal(P.toPayload(ok).adult, true);
  // 按「下一步」的時候不要求它（還沒走到那一步）
  assert.equal(P.validate(s, 1).ok, true); assert.equal(P.validate(s, 4).ok, true);
  // 草稿不帶它
  const mem = new Map(), store = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v2) => mem.set(k, v2), removeItem: k => mem.delete(k) };
  P.draftSave(TOKEN, ok, 5, "b", store);
  assert.doesNotMatch(mem.get(P.draftKey(TOKEN)), /adult/);
  assert.equal(P.draftLoad(TOKEN, "b", store).state.adult, false);
  // main.js：先 validate、沒過就 return，之後才叫資料庫
  const main = readFileSync(new URL("../profile/src/main.js", import.meta.url), "utf8");
  const save = main.slice(main.indexOf("async function save()"), main.indexOf("async function boot()"));
  assert.match(save, /const v = UI\.validate\(S\.form\);\n\s*if \(!v\.ok\) \{[^\n]*return; \}\n[\s\S]*rc_public_profile_save/, "沒過 validate 就 return，之後才叫資料庫");
  assert.equal((save.match(/rc_public_profile_save/g) || []).length, 1);
});

test("送出前的檢查：名字至少一個、email 的格式、年份四位數、有內容卻沒有學校名字的列", () => {
  let s = Object.assign(P.blank(), { adult: true });
  assert.equal(P.validate(s).errors.name_en, "need_name"); assert.equal(P.validate(s, 1).step, 1);
  s = P.setField(s, "name_zh", "測試講者");
  assert.equal(P.validate(s).ok, true, "只有名字就存得了，其他都選填");
  assert.equal(P.validate(P.setField(s, "contacts.email", "nope")).errors["contacts.email"], "bad_email");
  assert.equal(P.validate(P.setField(s, "contacts.email", " a@example.com ")).ok, true);
  let r = P.setField(P.addRow(s, "career"), "career.0.title", "Engineer");
  assert.equal(P.validate(r).errors["career.0.institution"], "row_need_org"); assert.equal(P.validate(r).step, 3);
  r = P.setField(r, "career.0.institution", "Example Corp");
  for (const y of ["19", "1949", "2101", "20x0", "二零二零"]) assert.equal(P.validate(P.setField(r, "career.0.year", y)).errors["career.0.year"], "bad_year", y);
  for (const y of ["", "1950", "2100", " 2024 "]) assert.equal(P.validate(P.setField(r, "career.0.year", y)).ok, true, y);
  // 上限跟資料庫同一組數字
  assert.deepEqual([P.LIMITS.name_zh, P.LIMITS.name_en, P.LIMITS.school, P.LIMITS.city, P.LIMITS.country, P.LIMITS.job_title, P.LIMITS.job_org, P.LIMITS.field, P.LIMITS.bio, P.LIMITS.story, P.LIMITS.institution, P.LIMITS.major, P.LIMITS.title, P.LIMITS.rows],
                   [40, 80, 120, 80, 80, 120, 120, 120, 600, 3000, 160, 120, 120, 10]);
  assert.equal(P.validate(P.setField(s, "bio", "字".repeat(601))).errors.bio, "too_long:bio");
  assert.equal(P.validate(P.setField(s, "bio", "字".repeat(600))).ok, true);
  assert.equal(P.validate(P.setField(s, "story.wish17", "x".repeat(3001))).step, 4);
  // 只看某一步的時候，別步的錯不算
  assert.equal(P.validate(P.setField(s, "bio", "字".repeat(601)), 1).ok, true);
  assert.deepEqual([P.stepOf("name_en"), P.stepOf("contacts.ig"), P.stepOf("school"), P.stepOf("education.0.year"), P.stepOf("bio"), P.stepOf("career.2.title"), P.stepOf("story.turning"), P.stepOf("share_story"), P.stepOf("adult")], [1, 1, 2, 2, 3, 3, 4, 5, 5]);
});

test("每一種錯誤代碼兩種語言各有一句人話，放得到格子的放在那一格", () => {
  const CODES = ["bad_link", "adult_only", "need_name", "bad_email", "too_long:city", "too_long:bio", "too_long:name", "too_long:school", "too_long:wish17", "too_long:phone", "too_long:row", "too_many", "too_many_rows", "bad_list"];
  const seen = { zh: new Set(), en: new Set() };
  for (const code of CODES) {
    const err = { message: code, code: "P0001" };
    const zh = P.errorText(err, false), en = P.errorText(err, true);
    assert.ok(zh && en && zh !== en, code);
    assert.match(zh, /[一-鿿]/, code + " 的中文"); assert.doesNotMatch(en, /[一-鿿]/, code + " 的英文裡沒有中文");
    assert.notEqual(zh, P.ERR.unknown[0], code + " 不是落到「不知道」那一句"); assert.notEqual(en, P.ERR.unknown[1], code);
    assert.doesNotMatch(zh + en, /too_|bad_|adult_only|need_name|P0001/, code + "：代碼本身不印給人看");
    seen.zh.add(zh); seen.en.add(en);
  }
  assert.equal(seen.zh.size, CODES.length, "每一種各自一句，沒有兩種共用同一句"); assert.equal(seen.en.size, CODES.length);
  // too_many_rows 不會被當成 too_many
  assert.match(P.errorText({ message: "too_many_rows" }, true), /at most 10/); assert.match(P.errorText({ message: "too_many" }, true), /hour/);
  // 寫太長了：講得出是哪一格、上限多少
  assert.equal(P.errorText({ message: "too_long:city" }, false), "「現在住的城市」寫太長了，最多 80 個字。");
  assert.equal(P.errorText({ message: "too_long:bio" }, true), "“Short bio” is too long. The limit is 600 characters.");
  assert.match(P.errorText({ message: "too_long:wish17" }, false), /你希望 17 歲的時候有人告訴你什麼？.*3000/);
  // 放在哪一格
  assert.deepEqual(["adult_only", "need_name", "bad_email", "too_long:city", "too_long:name", "too_long:school", "too_long:wish17", "too_long:phone", "too_long:bio"].map(c => P.errorField({ message: c })),
                   ["adult", "name_en", "contacts.email", "city", "name_en", "school", "story.wish17", "contacts.phone", "bio"]);
  for (const c of ["bad_link", "too_many", "too_many_rows", "bad_list", "too_long:row", "something else"]) assert.equal(P.errorField({ message: c }), "", c + " 對不到格子，放最上面");
  // 那一格底下真的印得出那一句
  const s = P.fromServer(SERVER);
  assert.match(P.formHTML(s, { step: 1, en: false, errors: { "contacts.email": "bad_email" } }), /id="pf-contacts-email"[^>]*aria-invalid="true"[^>]*aria-describedby="pf-contacts-email-h pf-contacts-email-e"[\s\S]*id="pf-contacts-email-e" role="alert">email 的格式不對/);
  assert.match(P.formHTML(s, { step: 1, en: true, errors: { city: "too_long:city" } }), /id="pf-city-e" role="alert">“Current city” is too long/);
  // 網路斷掉與不認得的錯誤：也各有一句，而且說他打的字還在
  for (const m of ["TypeError: Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"]) {
    assert.match(P.errorText({ message: m }, false), /連不上.*都還在/); assert.match(P.errorText({ message: m }, true), /could not reach.*still here/);
  }
  assert.match(P.errorText({ message: "weird" }, false), /沒有存進去.*都還在/); assert.match(P.errorText(null, true), /did not save/);
  // 這一頁自己先擋的三種也有兩種語言
  for (const c of ["bad_year", "row_need_school", "row_need_org"]) { assert.notEqual(P.errorText(c, false), P.ERR.unknown[0]); assert.notEqual(P.errorText(c, true), P.ERR.unknown[1]); }
  for (const [code, pair] of Object.entries(P.ERR)) { assert.equal(pair.length, 2, code); assert.ok(pair[0] && pair[1], code); }
});

test("連結不對：一句話加 BT 的信箱，沒有表單、沒有任何格子", () => {
  for (const en of [false, true]) {
    const h = P.wrongLinkHTML(en);
    assert.doesNotMatch(h, /<form|<input|<textarea|<button|<select|data-nav/);
    assert.match(h, /mailto:beyondtaiwan2020@gmail\.com/);
    assert.match(h, en ? /This link does not work/ : /這條連結打不開/);
    const f = P.loadFailHTML(en, false), off = P.loadFailHTML(en, true);
    assert.doesNotMatch(f + off, /<form|<input|<textarea|<button/);
    assert.match(off, en ? /offline/ : /沒有連上網路/);
  }
  // main.js：網址上沒有 token 或太短，不問資料庫；資料庫回 null 也是同一句
  const main = readFileSync(new URL("../profile/src/main.js", import.meta.url), "utf8");
  assert.match(main, /if \(token\(\)\.length < 32\) \{ S\.view = "wrong"; render\(\); return; \}/);
  assert.match(main, /if \(!d\) \{ S\.view = "wrong"; render\(\); return; \}/);
});

test("★ 六題故事的字跟定稿一字不差，兩種語言都是；每一題一個自己的 textarea", () => {
  const WANT = {
    highschool: ["高中的你是什麼樣子？那時候想成為什麼樣的人？", "What were you like in high school, and what did you want to become then?"],
    turning: ["是哪一個轉捩點，讓你走上現在這條路？", "What was the turning point that set you on your current path?"],
    hardest: ["最難的一刻是什麼？你怎麼走過來的？", "What was the hardest moment, and how did you get through it?"],
    decision: ["有哪一個決定你會再做一次？哪一個你會改？", "What's one decision you'd make again, and one you'd change?"],
    wish17: ["你希望 17 歲的時候有人告訴你什麼？", "What do you wish someone had told you at 17?"],
    first_step: ["如果一個台灣學生想走你這條路，他第一步該做什麼？", "If a Taiwanese student wanted your path, what should they do first?"],
  };
  assert.deepEqual(P.STORY_KEYS, Object.keys(WANT));
  assert.deepEqual(P.STORY, WANT);
  for (const en of [false, true]) {
    const h = P.formHTML(P.fromServer(SERVER), { step: 4, en });
    for (const k of P.STORY_KEYS) {
      const q = P.esc(WANT[k][en ? 1 : 0]);
      assert.ok(h.includes(`<label class="pf-l" for="pf-story-${k}">${q}</label>`), `${k} ${en ? "en" : "zh"}`);
      assert.ok(h.includes(`<textarea id="pf-story-${k}" name="story.${k}" maxlength="3000"`), k);
      assert.ok(!h.includes(WANT[k][en ? 0 : 1]) || WANT[k][0] === WANT[k][1], "一次只印一種語言");
    }
    assert.equal((h.match(/<textarea/g) || []).length, 6);
    assert.match(h, en ? /Short, honest answers are better than polished ones/ : /短短幾句老實話就很好/);
    assert.match(h, en ? /only reuses what you write here if you agree in the next step/ : /一定要你在下一步同意才行/);
  }
  assert.match(P.formHTML(P.fromServer(SERVER), { step: 4, en: false }), /name="story\.turning"[^>]*>A fake turning point\.<\/textarea>/, "之前寫過的答案帶回來");
});

test("★ token 不出現在畫面、草稿與送出去的那一份裡，只在換語言的網址上", () => {
  const s = P.fromServer(SERVER);
  const out = [allSteps(s, false), allSteps(s, true), allSteps(s, true, { errors: P.validate(P.blank()).errors, msg: "x", busy: true }),
               P.doneHTML(s, metaOf(SERVER), false), P.doneHTML(s, metaOf(SERVER), true), P.wrongLinkHTML(false), P.wrongLinkHTML(true), P.loadFailHTML(false, true),
               JSON.stringify(P.toPayload(s)), P.stepsHTML(2, true), P.draftKey(TOKEN), P.hashToken(TOKEN)].join("\n");
  assert.ok(!out.includes(TOKEN)); assert.ok(!out.includes(TOKEN.slice(0, 16)), "連一半都沒有");
  assert.doesNotMatch(out, /[?&]t=/, "畫面上沒有任何帶著 t= 的網址");
  // 換語言的網址：token 留著，只換 lang
  assert.equal(P.langHref(TOKEN, "en"), `?t=${TOKEN}&lang=en`); assert.equal(P.langHref(TOKEN, "zh"), `?t=${TOKEN}&lang=zh`);
  assert.equal(P.langHref(TOKEN, "whatever"), `?t=${TOKEN}&lang=zh`); assert.equal(P.langHref("", "en"), "?lang=en");
  assert.equal(P.langHref("a b&c", "en"), "?t=a%20b%26c&lang=en");
  // 草稿：鑰匙是雜湊，內容裡沒有 token
  const mem = new Map(), store = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  P.draftSave(TOKEN, s, 3, "2027-01-01T00:00:00Z", store);
  assert.equal(mem.size, 1);
  for (const [k, v] of mem) { assert.ok(!k.includes(TOKEN) && !v.includes(TOKEN)); assert.match(k, /^bt\.pf\.draft\.[a-z0-9]+$/); }
  assert.notEqual(P.hashToken(TOKEN), P.hashToken(TOKEN.replace("0", "1"))); assert.equal(P.hashToken(TOKEN), P.hashToken(TOKEN));
  // main.js：token 只餵給兩支 rpc 與 langHref、草稿那三支；不印到 console、不碰 localStorage
  const main = readFileSync(new URL("../profile/src/main.js", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  const uses = main.match(/token\(\)/g).length;
  const okUses = (main.match(/p_token: token\(\)/g) || []).length + (main.match(/UI\.langHref\(token\(\)/g) || []).length + (main.match(/UI\.draft(Save|Load|Clear)\(token\(\)/g) || []).length + (main.match(/token\(\)\.length < 32/g) || []).length;
  assert.equal(uses, okUses, "main.js 裡每一個 token() 都是 rpc、langHref、草稿或長度檢查");
  assert.equal((main.match(/p_token: token\(\)/g) || []).length, 2);
  assert.doesNotMatch(main, /localStorage|console\.[a-z]+\([^)]*token|location\.href\s*=/);
  for (const line of main.split("\n").filter(l => /console\./.test(l))) assert.doesNotMatch(line, /token|err\)|, e\)|err\.message/, "console 只印錯誤代碼：" + line.trim());
});

test("草稿只放這個分頁（sessionStorage 的位置），存成功就清；別處存過新的就不拿舊草稿；壞掉的儲存空間不會讓頁面掛掉", () => {
  const mem = new Map(), store = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  let s = P.setField(P.fromServer(SERVER), "story.hardest", "A fake hard moment.");
  s = P.setField(P.addRow(s, "career"), "career.1.institution", "Example Lab");
  P.draftSave(TOKEN, s, 4, "base-1", store);
  const d = P.draftLoad(TOKEN, "base-1", store);
  assert.equal(d.step, 4); assert.deepEqual(d.state, Object.assign({}, s, { adult: false }));
  assert.deepEqual(P.toPayload(d.state).education.map(r => r.id), [ID1, ID2], "草稿倒回來，載進來的列還帶著 id");
  assert.equal(P.draftLoad(TOKEN, "base-2", store), null, "資料庫那一份比草稿新");
  assert.equal(P.draftLoad("another-token-another-token-another", "base-1", store), null, "別條連結讀不到");
  P.draftClear(TOKEN, store);
  assert.equal(P.draftLoad(TOKEN, "base-1", store), null); assert.equal(mem.size, 0);
  // 草稿被亂改過：多出來的鍵不進狀態、步數不對回第一步
  mem.set(P.draftKey(TOKEN), JSON.stringify({ state: { name_en: "X", evil: "y", adult: true, share_story: "yes", education: "nope", career: [null] }, step: 99, base: "b" }));
  const odd = P.draftLoad(TOKEN, "b", store);
  assert.equal(odd.step, 1); assert.equal(odd.state.evil, undefined); assert.equal(odd.state.adult, false); assert.equal(odd.state.share_story, false);
  assert.deepEqual(odd.state.education, []); assert.equal(odd.state.career.length, 1);
  mem.set(P.draftKey(TOKEN), "{not json");
  assert.equal(P.draftLoad(TOKEN, "b", store), null);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(P.draftLoad(TOKEN, "b", broken), null);
  assert.doesNotThrow(() => P.draftSave(TOKEN, s, 1, "b", broken)); assert.doesNotThrow(() => P.draftClear(TOKEN, broken));
  assert.doesNotThrow(() => P.draftSave(TOKEN, s, 1, "b"), "node 底下沒有 sessionStorage 也不會掛");
  const main = readFileSync(new URL("../profile/src/main.js", import.meta.url), "utf8");
  assert.match(main, /UI\.draftClear\(token\(\)\)/); assert.ok(main.indexOf("UI.draftClear(token())") > main.indexOf("rc_public_profile_save"), "存成功之後才清");
});

test("第一步：用名字打招呼、說 BT 是誰、為什麼問、大概多久、只有名字必填；有活動就說哪一場哪一天（台灣時間，帶星期）", () => {
  const s = P.fromServer(SERVER);
  const zh = P.formHTML(s, { step: 1, en: false, meta: metaOf(SERVER) }), en = P.formHTML(s, { step: 1, en: true, meta: metaOf(SERVER) });
  assert.match(zh, /測試講者，你好。/); assert.match(en, /Hello Test Speaker,/);
  assert.match(zh, /學生自己在經營的非營利組織/); assert.match(en, /student-run non-profit/);
  assert.match(zh, /大概花 10 分鐘。只有名字一定要填/); assert.match(en, /about ten minutes\. Only your name is required/);
  assert.match(zh, /看得到你存過的內容，隨時可以回來改/); assert.match(en, /see what you saved and change it/);
  // 2027-01-03T01:00Z 是台灣的 1 月 3 日星期日
  assert.match(zh, /你會在「寒假探索營（假）」分享，日期是台灣時間 2027 年 1 月 3 日（日）。/);
  assert.match(en, /You are speaking at Winter Camp \(fake\) on Sunday, 3 January 2027 \(Taiwan time\)\./);
  // 台灣已經是隔天、UTC 還在前一天的時間，印的是台灣那一天
  assert.equal(P.dateText("2027-01-02T16:30:00Z", false), "2027 年 1 月 3 日（日）"); assert.equal(P.dateText("2027-01-02T16:30:00Z", true), "Sunday, 3 January 2027");
  assert.equal(P.dateText(null, true), ""); assert.equal(P.dateText("nope", false), "");
  // 過去的場次不說「會」；沒有日期就不印日期；沒有活動就沒有那一句
  assert.deepEqual(P.eventLines(SERVER.events, true, "2027-02-01T00:00:00Z"), ["You spoke at Winter Camp (fake) on Sunday, 3 January 2027."]);
  assert.deepEqual(P.eventLines([{ title_zh: "", title_en: "Info Session (fake)", starts_at: null }], false, NOW), ["你會在「Info Session (fake)」分享。"]);
  assert.deepEqual(P.eventLines([], true, NOW), []); assert.deepEqual(P.eventLines(undefined, true, NOW), []);
  assert.doesNotMatch(P.formHTML(s, { step: 1, en: true, meta: { events: [] } }), /speaking at/);
  // 沒有名字就不硬叫
  assert.match(P.formHTML(P.blank(), { step: 1, en: false }), /<p class="pf-hi">你好。<\/p>/);
  // 第一步的十格都在、都有 label、帶著原本的值；input 沒有 type=file
  for (const [name, val] of [["name_en", "Test Speaker"], ["name_zh", "測試講者"], ["city", "Madison"], ["country", "USA"], ["contacts.email", "speaker@example.com"], ["contacts.phone", "+1 608 555 0100"], ["contacts.linkedin", ""], ["contacts.ig", ""], ["contacts.line", ""], ["contacts.website", ""]]) {
    const id = P.fieldId(name);
    assert.ok(zh.includes(`<label class="pf-l" for="${id}">`), name + " 有 label");
    assert.match(zh, new RegExp(`id="${id}" name="${name.replace(".", "\\.")}"[^>]* value="${val.replace(/[+]/g, "\\+")}"`), name);
  }
  assert.doesNotMatch(allSteps(s, false) + allSteps(s, true), /type="file"/, "這一頁不收檔案");
  // 照片：有就小小一張加一句，沒有就一句
  assert.match(zh, /這一頁沒辦法上傳照片。需要照片的時候，BT 會另外跟你要。/); assert.doesNotMatch(zh, /<img/);
  const withPhoto = P.formHTML(s, { step: 1, en: true, meta: { photo_url: "https://example.com/p.jpg" } });
  assert.match(withPhoto, /<img src="https:\/\/example\.com\/p\.jpg" alt="Photo added by BT" width="72" height="72"/); assert.match(withPhoto, /BT added this photo/);
  assert.doesNotMatch(P.formHTML(s, { step: 1, en: true, meta: { photo_url: "javascript:alert(1)" } }), /<img/, "不是 https 的不畫");
  // 資料庫裡的字先逃脫再印
  const evil = P.fromServer({ person: { name_en: '<img src=x onerror="1">' }, profile: { bio: "</textarea><script>" }, contacts: {}, education: [{ id: ID1, kind: "graduated", institution: '"><i>evil', major: "", title: "", year: null }], career: [] });
  const eh = allSteps(evil, true);
  assert.doesNotMatch(eh, /<img src=x|<script>|"><i>evil/); assert.match(eh, /&lt;img src=x/); assert.match(eh, /&quot;&gt;&lt;i&gt;evil/); assert.match(eh, /&lt;\/textarea&gt;&lt;script&gt;/);
});

test("五步：進度、上一步與下一步、最後一步才有儲存；學歷與經歷可以加可以拿掉；自我介紹有字數", () => {
  const s = P.fromServer(SERVER);
  for (const en of [false, true]) {
    for (let step = 1; step <= 5; step++) {
      const h = P.formHTML(s, { step, en, meta: metaOf(SERVER) });
      assert.match(h, new RegExp(en ? `Step ${step} of 5` : `第 ${step} 步，共 5 步`));
      assert.equal((h.match(/aria-current="step"/g) || []).length, 1); assert.match(h, new RegExp(`data-go="${step}" aria-current="step"`));
      assert.equal((h.match(/<h2 /g) || []).length, 1, "一次只有一步");
      assert.equal(/data-nav="back"/.test(h), step > 1); assert.equal(/data-nav="next"/.test(h), step < 5); assert.equal(/data-nav="save"/.test(h), step === 5);
      // 每一個 input 與 textarea 都有對得上的 label
      for (const m of h.matchAll(/<(?:input|textarea)[^>]* id="([^"]+)"|<(?:input|textarea) id="([^"]+)"/g)) { const id = m[1] || m[2]; assert.ok(h.includes(`for="${id}"`), `${id} 沒有 label`); }
      assert.doesNotMatch(h, /[—–]/, "不用破折號"); assert.doesNotMatch(h, /undefined|\{\w+\}|NaN/);
      if (en) assert.doesNotMatch(h.replace(/測試講者|寒假探索營（假）/g, ""), /[一-鿿]/, `英文版第 ${step} 步沒有漏翻的中文`);
    }
  }
  assert.match(P.formHTML(s, { step: 5, en: true, busy: true }), /data-nav="save" disabled>Saving…/);
  // 第二步：高中、兩所學校各一個 fieldset、還在念的那一所勾著、可以加可以拿掉
  const edu = P.formHTML(s, { step: 2, en: false });
  assert.match(edu, /id="pf-school" name="school" maxlength="120"[^>]* value="Example Senior High School"/);
  assert.equal((edu.match(/<fieldset class="pf-row">/g) || []).length, 2);
  assert.match(edu, /name="education\.1\.enrolled" checked/); assert.doesNotMatch(edu, /name="education\.0\.enrolled" checked/);
  assert.match(edu, /id="pf-education-0-year" name="education\.0\.year" maxlength="4"[^>]*inputmode="numeric"[^>]* value="2019"/);
  assert.match(edu, /data-del="education\.0" aria-label="拿掉第 1 所學校"/); assert.match(edu, /data-add="education">加一所學校/);
  assert.doesNotMatch(edu, new RegExp(ID1), "列的 id 不印在畫面上，留在狀態裡");
  // 第三步：職稱、單位、專長、自我介紹（600 字、有字數）、以前的工作
  const work = P.formHTML(s, { step: 3, en: true });
  assert.match(work, /<textarea id="pf-bio" name="bio" maxlength="600"[^>]*aria-describedby="pf-bio-h"/); assert.match(work, /id="pf-bio-c">12 \/ 600</);
  assert.match(work, /BT uses it to match you with students&#39; questions/);
  assert.match(work, /name="career\.0\.institution"[^>]* value="Old Example Ltd"/); assert.match(work, /data-add="career">Add a role/);
  assert.equal(P.countText("字字字", 600), "3 / 600");
  // 滿十列就沒有「加一筆」
  let full = P.blank(); for (let i = 0; i < 10; i++) full = P.addRow(full, "education");
  const fh = P.formHTML(full, { step: 2, en: false });
  assert.doesNotMatch(fh, /data-add="education"/); assert.match(fh, /最多列 10 筆。/);
  assert.match(P.formHTML(P.blank(), { step: 2, en: true }), /No schools listed yet\./);
  // 步數亂給也不會壞
  assert.match(P.formHTML(s, { step: 99, en: false }), /data-nav="save"/); assert.match(P.formHTML(s, {}), /第 1 步，共 5 步/);
});

test("存好之後：說存了什麼、連結到哪一天、一顆回去改的按鈕", () => {
  const s = P.fromServer(SERVER);
  const zh = P.doneHTML(s, metaOf(SERVER), false), en = P.doneHTML(s, metaOf(SERVER), true);
  assert.match(zh, /存好了，謝謝你。/); assert.match(en, /Saved\. Thank you\./);
  assert.match(zh, /名字：測試講者 \/ Test Speaker/); assert.match(zh, /學歷：2 筆/); assert.match(zh, /以前的工作：1 筆/); assert.match(zh, /故事：6 題裡寫了 1 題/);
  assert.match(en, /Education entries: 2/); assert.match(en, /Story questions answered: 1 of 6/);
  assert.match(zh, /BT 可以引用我寫的故事/); assert.match(zh, /我願意在 BT 的活動分享/); assert.doesNotMatch(zh, /BT 可以公開我的名字/);
  assert.match(zh, /這條連結到台灣時間 2027 年 4 月 3 日（六）之前都打得開/); assert.match(en, /keeps working until Saturday, 3 April 2027 \(Taiwan time\)/);
  assert.match(zh, /data-nav="edit">回去修改/); assert.match(en, /data-nav="edit">Go back and edit/);
  assert.doesNotMatch(zh + en, /<input|<textarea|[—–]|undefined/);
  const none = P.doneHTML(Object.assign(P.blank(), { name_en: "Test Guest" }), {}, true);
  assert.match(none, /You did not tick any of the five boxes\./); assert.match(none, /just open this same link again/);
});

test("每一句都有中英兩版，沒有破折號與 emoji；用「你」不用「您」", () => {
  const pairs = [...Object.entries(P.TX), ...Object.entries(P.ERR), ...Object.entries(P.LABEL), ...Object.entries(P.STORY)];
  for (const [k, pair] of pairs) {
    assert.equal(pair.length, 2, k); assert.ok(pair[0] !== "" && pair[1] !== "", k + " 兩版都要有字");
    assert.doesNotMatch(pair[0] + pair[1], /[—–]|\p{Extended_Pictographic}/u, k);
    assert.doesNotMatch(pair[1], /[一-鿿]/, k + " 的英文版裡有中文"); assert.doesNotMatch(pair[0], /您/, k);
  }
  for (const [k, [zh, en]] of Object.entries(P.CONSENT)) { assert.equal(zh.length, 2, k); assert.equal(en.length, 2, k); assert.doesNotMatch(zh.join("") + en.join(""), /[—–]|您|\p{Extended_Pictographic}/u, k); }
  assert.deepEqual(Object.keys(P.CONSENT), P.FLAGS);
  // 用到的每一個字串鍵都真的存在（t() 對不到會印空字串，畫面上就少一句）
  const src = readFileSync(new URL("../profile/src/ui.js", import.meta.url), "utf8"), main = readFileSync(new URL("../profile/src/main.js", import.meta.url), "utf8");
  for (const m of (src + main).matchAll(/\bt\("([a-zA-Z_]+)",/g)) assert.ok(P.TX[m[1]], "TX 裡沒有 " + m[1]);
  for (const k of P.STEPS) assert.ok(P.TX["s_" + k], k);
  for (const k of ["eduRow", "careerRow", "eduDel", "careerDel", "eduAdd", "careerAdd", "eduEmpty", "careerEmpty", "eduYearHint", "careerYearHint", "saving", "save", "loadOffline", "loadFail", "evPast", "evNext"]) assert.ok(P.TX[k], k);
});

test("HTML 外殼：noindex、no-referrer、預設中文、不載 nav.js、沒有上傳、有點擊回饋與 reduced-motion", () => {
  const html = readFileSync(new URL("../profile/index.html", import.meta.url), "utf8"), live = html.replace(/<!--[\s\S]*?-->/g, "");
  assert.match(live, /<meta name="robots" content="noindex">/);
  assert.match(live, /<meta name="referrer" content="no-referrer">/);
  assert.match(live, /<html lang="zh-Hant">/);
  assert.match(live, /setAttribute\("data-lang", q === "en" \? "en" : "zh"\)/, "預設中文，只有 ?lang=en 才是英文（不看瀏覽器語言）");
  assert.match(live, /<a class="lang" id="lang" href="\?lang=en"/, "看得到的換語言按鈕");
  assert.match(live, /<script type="module" src="\.\/src\/main\.js"><\/script>/);
  assert.match(live, /<a class="home" href="\.\.\/" aria-label="Beyond Taiwan 首頁">/);
  assert.match(live, /href="\.\.\/privacy\/"/); assert.match(live, /beyondtaiwan2020@gmail\.com/);
  assert.doesNotMatch(live, /nav\.js|rail\.js|auth\.js|forms\.js/, "不載站內選單、不碰登入");
  assert.doesNotMatch(live, /type="file"|<form|localStorage/);
  assert.match(live, /點下去要有回饋/); assert.match(live, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(live, /\.pf-f input\[type=text\][^{]*\{[^}]*font-size:16px/, "格子的字 16px，iOS 才不會放大畫面");
  assert.match(live, /overflow-x:clip/);
  // 外部資源只有 Google Fonts（跟回饋表同一行）；沒有別的 CDN
  const ext = [...live.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)].map(m => new URL(m[1]).host);
  assert.deepEqual([...new Set(ext)].sort(), ["fonts.googleapis.com", "fonts.gstatic.com"]);
  const fb = readFileSync(new URL("../feedback/index.html", import.meta.url), "utf8");
  const fonts = h => h.match(/https:\/\/fonts\.googleapis\.com\/css2[^"]+/)[0];
  assert.equal(fonts(live), fonts(fb), "字體跟回饋表要的一模一樣");
  // ui.js 不 import 任何東西（node 底下直接測得了）；main.js 只 import 共用的連線與 ui.js
  const ui = readFileSync(new URL("../profile/src/ui.js", import.meta.url), "utf8"), main = readFileSync(new URL("../profile/src/main.js", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /^\s*import /m);
  assert.deepEqual([...main.matchAll(/^import .* from "([^"]+)";$/gm)].map(m => m[1]), ["../../shared/supabase.js", "./ui.js"]);
  assert.match(main, /supabase\.rpc\("rc_public_profile", \{ p_token: token\(\) \}\)/);
  assert.match(main, /supabase\.rpc\("rc_public_profile_save", \{ p_token: token\(\), p: UI\.toPayload\(S\.form\) \}\)/);
});
