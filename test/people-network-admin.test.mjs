// 關係網的後台那一半（2027-01-03）。跑法：node --test test/*.test.mjs
// Paul 2026-11-23：「turn BT's people database… into a relationship network」。資料庫那一半在 supabase/migrations/2027-01-03-people-network.sql
//（test/people-network-db.test.mjs 與 scripts/db/smoke.sh 守），對外那一頁在 /profile/。這一支守後台畫面：
//   1. 標籤怎麼叫：幹部不在這一屆了叫校友（前幹部），學員畢業了叫以前的學員；兩份字典（admin/records、admin）的名字一樣。
//   2. 畫面不再印「種類」（成員、學員、來賓）：名錄的列、一個人的頁面、加一個人的表單。
//   3. 一個人的頁面：新的幾塊照順序排；管的人改得動、看的人只讀。
//   4. BT 給的三種標籤的編輯區；賺來的標籤沒有任何一格能改。
//   5. 個人連結四種狀態：沒有、有效（管的人看得到連結）、有效（看的人看不到）、過期。
//   6. 同意只能取消：整頁沒有任何一格或一條路送得出 true。
//   7. 名錄的標籤篩選與兩個快速篩選；原本的篩選照舊。
//   8. 遷移檔還沒跑：畫面照舊，多一句說要跑哪一支。
//   9. 活動編輯頁挑講者：只填空的格子，同意不會自己勾。
// 資料全是假的，沒有真人。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as UI from "../admin/records/src/ui.js";
import * as RS from "../admin/records/src/strings.js";
import { says, saysUpload } from "../admin/records/src/data.js";
import * as F from "../admin/src/ui.js";
import * as FS from "../admin/src/strings.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const at = (h, s) => { const i = h.indexOf(s); assert.ok(i >= 0, `找不到 ${s}`); return i; };
const count = (h, re) => (h.match(re) || []).length;
const zh = () => { UI.setLang("zh"); F.setLang("zh"); };
const en = () => { UI.setLang("en"); F.setLang("en"); };
zh();

// 一位講者：以前是幹部，現在是講者，BT 給了「教授」。個人檔案填了一半，故事寫了一題，同意了名字照片、沒同意引用故事。
const PROFILE = { photo_url: "https://x.supabase.co/storage/v1/object/public/people/p1/1-abc.jpg", city: "Taipei", country: "Taiwan", job_title: "Engineer", job_org: "Acme Labs", field: "Machine learning", bio: "第一行\n第二行",
  story: { highschool: "很安靜的人", wish17: "<b>不要怕</b>" }, offer_speak: true, offer_mentor: false, contact_ok: true, share_profile: true, share_story: false,
  consent_at: "2026-12-01T03:00:00Z", done_at: "2026-12-01T03:00:00Z", updated_at: "2026-12-01T03:00:00Z",
  rel_owner: "m1", rel_owner_name: "Mia Member", rel_last_contact: "2026-11-20", rel_open: "open", rel_note: "在研討會認識的" };
const LABELS = [
  { label: "member", source: "earned", since: 2023, until: null, current: false, n: 2, detail: "Curriculum Team" },
  { label: "speaker", source: "earned", since: 2025, until: null, current: true, n: 3, detail: "" },
  { label: "mentor", source: "earned", since: 2024, until: null, current: false, n: 1, detail: "" },
  { label: "professor", source: "given", since: 2020, until: 2026, current: true, n: 0, detail: "NTU Economics" },
];
const LINK = { token: "tok0123456789abcdef0123456789abcdef", created_at: "2026-11-20T02:00:00Z", expires_at: "2027-02-18T02:00:00Z", expired: false, opened_at: "2026-11-21T02:00:00Z", submitted_at: null };
const PERSON = { person: { id: "p1", name: "Nina Speaker", name_en: "Nina Speaker", kind: "guest", school: "", grad_year: null, has_account: false },
  labels: LABELS, given: [{ label: "professor", detail: "NTU Economics", since: 2020, until: 2026 }], profile: PROFILE, link: LINK,
  speaking: [{ event_id: "e1", slug: "jan-talk", event: "一月分享會", starts_at: "2027-01-03T02:00:00Z", subject: "Machine learning", consent: false }],
  participation: [], pairs: [], responses: [], schools: [], aliases: [], identities: [],
  outcomes: [{ id: "o1", kind: "working", institution: "Acme Labs", title: "Staff Engineer", year: 2026, visibility: "internal", source: "self" }] };
const DIR = [
  { id: "m1", name: "Mia Member", kind: "member", labels: ["member"], school: "", has_account: true, role: "cadre", terms: [], events: [], countries: [], n: 0 },
  { id: "p1", name: "Nina Speaker", kind: "guest", labels: ["member:past", "speaker", "professor"], field: "Machine learning", job_title: "Engineer", job_org: "Acme Labs", city: "Taipei", country_now: "Taiwan",
    offer_speak: true, offer_mentor: false, profile_done: true, rel_open: "open", school: "", has_account: false, terms: [], events: [], countries: [], n: 3 },
  { id: "s1", name: "Sam Student", kind: "student", labels: ["student"], school: "Test High", grad_year: 2030, offer_speak: false, offer_mentor: false, has_account: false, terms: [], events: [], countries: [], n: 1 },
  { id: "s2", name: "Olga Oldstudent", kind: "student", labels: ["student:past", "mentor:past"], school: "Test High", grad_year: 2020, offer_speak: false, offer_mentor: true, has_account: false, terms: [], events: [], countries: [], n: 2 },
];
const MGR = { boot: { can_manage: true, events: [{ id: "e1", slug: "jan-talk", title_zh: "一月分享會", title_en: "January talk", term_id: "2026-27", starts_at: "2027-01-03T02:00:00Z" }] }, me: { pres: true }, msg: "", busy: false, dir: DIR, view: "people", id: "p1" };
const VIEWER = { boot: { can_manage: false, events: [] }, me: {}, msg: "", busy: false, dir: null, view: "people", id: "p1" };

test("★ 標籤的名字：Paul 定的十三個；幹部與學員「以前是」有自己的名字，其他幾種現在與以前同名", () => {
  const want = {
    "lab.member": ["幹部", "Member"], "lab.member.past": ["校友（前幹部）", "Alumni (former member)"], "lab.intern": ["實習生", "Intern"],
    "lab.student": ["學員", "Student"], "lab.student.past": ["以前的學員", "Past participant"], "lab.mentee": ["Mentee", "Mentee"], "lab.mentor": ["Mentor", "Mentor"],
    "lab.speaker": ["講者", "Speaker"], "lab.volunteer": ["志工", "Volunteer"], "lab.organizer": ["主辦", "Organizer"],
    "lab.professor": ["教授", "Professor"], "lab.admission_officer": ["招生官", "Admission officer"], "lab.connection": ["聯絡人", "Connection"],
  };
  for (const [k, [z, e]] of Object.entries(want)) {
    assert.deepEqual([RS.STRINGS[k].zh, RS.STRINGS[k].en], [z, e], `admin/records 的 ${k}`);
    assert.deepEqual(FS.STRINGS[k], RS.STRINGS[k], `admin/ 的 ${k} 跟 admin/records 那一份不一樣`);
  }
  assert.equal(UI.labelName("member", true), "幹部"); assert.equal(UI.labelName("member", false), "校友（前幹部）");
  assert.equal(UI.labelName("student", true), "學員"); assert.equal(UI.labelName("student", false), "以前的學員");
  assert.equal(UI.labelName("mentor", false), "Mentor", "Mentor 以前與現在同一個名字");
  assert.equal(UI.labelName("speaker", false), "講者");
  assert.deepEqual(UI.parseLabel("student:past"), { label: "student", current: false }); assert.deepEqual(UI.parseLabel("speaker"), { label: "speaker", current: true });
  en();
  try { assert.equal(UI.labelName("member", false), "Alumni (former member)"); assert.equal(UI.labelName("student", false), "Past participant"); assert.equal(UI.labelName("admission_officer", true), "Admission officer"); }
  finally { zh(); }
  // 標籤的清單跟遷移檔的檢查式對得上。2027-01-06 起十一種都可以自己加（原本只有三種），資料表的 check 與 rc_label_set 都要認得每一種。
  const sql = read("supabase/migrations/2027-01-03-people-network.sql"), sql6 = read("supabase/migrations/2027-01-06-labels-and-schools.sql");
  assert.match(sql, /label in \('professor', 'admission_officer', 'connection'\)/);
  assert.deepEqual(UI.GIVEN_LABELS, UI.LABELS, "十一種都可以自己加");
  const all11 = "'member', 'intern', 'student', 'mentee', 'mentor', 'speaker', 'volunteer', 'organizer', 'professor', 'admission_officer', 'connection'";
  assert.equal(count(sql6, new RegExp(`label in \\(${all11}\\)|p_label not in \\(${all11}\\)`, "g")), 2, "資料表的 check 與 rc_label_set 各認得十一種");
  assert.deepEqual(all11.replace(/'/g, "").split(", "), UI.LABELS, "順序也跟畫面的一樣");
  for (const l of UI.LABELS) assert.ok(sql.includes(`'${l}'`), `遷移檔裡沒有 ${l}`);
});

test("★ 名錄的一排標籤：照資料庫給的順序；現在不是了的變淡（class past）、字照樣在；認不得的代碼不印", () => {
  const h = UI.labelChipsHTML(["member:past", "speaker", "mentor:past", "from_the_future"]);
  assert.equal(h, '<span class="tag who-member past">校友（前幹部）</span> <span class="tag who-speaker">講者</span> <span class="tag who-mentor past">Mentor</span>');
  assert.equal(UI.labelChipsHTML([]), ""); assert.equal(UI.labelChipsHTML(null), "");
  assert.match(read("admin/admin.css"), /^\.tag\.past\{opacity:\.55\}$/m, "變淡的樣式在 admin.css");
});

test("★ 一個人的頁面上的標籤：哪一年起、幾次（超過一次才寫）、補充說明；BT 給的可以有到哪一年", () => {
  assert.deepEqual(UI.labelFacts(LABELS[0]), ["2023 年起", "2 屆", "Curriculum Team"]);
  assert.deepEqual(UI.labelFacts(LABELS[1]), ["2025 年起", "3 場"]);
  assert.deepEqual(UI.labelFacts(LABELS[2]), ["2024 年起"], "只有一次就不寫次數");
  assert.deepEqual(UI.labelFacts(LABELS[3]), ["2020 到 2026 年", "NTU Economics"]);
  assert.deepEqual(UI.labelFacts({ label: "mentee", since: null, until: null, n: 2, detail: "" }), ["配對 2 次"]);
  assert.deepEqual(UI.labelFacts({ label: "connection", since: null, until: 2025, n: 0, detail: "" }), ["到 2025 年"]);
  en();
  try { assert.deepEqual(UI.labelFacts(LABELS[1]), ["since 2025", "3 events"]); assert.deepEqual(UI.labelFacts(LABELS[0]), ["since 2023", "2 terms", "Curriculum Team"]); }
  finally { zh(); }
  const h = UI.personLabelsHTML(PERSON, MGR, true);
  assert.match(h, /<li title="現在不是了"><span class="tag who-member past">校友（前幹部）<\/span> <span class="mini">2023 年起・2 屆・Curriculum Team<\/span> <span class="mini rc-labsrc">從紀錄來的<\/span><\/li>/);
  assert.match(h, /<li><span class="tag who-speaker">講者<\/span> <span class="mini">2025 年起・3 場<\/span> <span class="mini rc-labsrc">從紀錄來的<\/span><\/li>/);
  assert.match(h, /who-professor[^]*?<span class="mini rc-labsrc">BT 加的<\/span>/, "每一行後面寫來源");
  // 2027-01-06 那一支跑過之後每一列多 given、earned 兩個鍵：兩邊都有的那一種寫「從紀錄來的，BT 補了說明」
  assert.match(UI.personLabelsHTML({ ...PERSON, labels: [{ label: "speaker", source: "earned", given: true, earned: true, since: 2027, until: null, current: true, n: 1, detail: "Overseas Unpacked 2027" }] }, MGR, true),
    /<span class="mini">2027 年起・Overseas Unpacked 2027<\/span> <span class="mini rc-labsrc">從紀錄來的，BT 補了說明<\/span>/);
  assert.match(h, /標籤有兩個來源。紀錄：出席、職位、配對、當講者會自己帶出標籤，要拿掉就去改那一筆紀錄。BT：下面可以自己加任何一種[^<]*標籤只是描述一個人，不給任何權限。/);
  assert.doesNotMatch(h, /這裡改不了/, "2026-11-25 Paul：「why is it not editable from people?」");
  assert.match(UI.personLabelsHTML({ ...PERSON, labels: [] }, MGR, true), /還沒有標籤。/);
});

test("★ 畫面不再印「種類」：一個人的頁面與名錄的列都只印標籤；加一個人不再有三選一", () => {
  for (const [lang, words] of [[zh, ["來賓", "成員"]], [en, ["Guest"]]]) {
    lang();
    try {
      const h = UI.personHTML(PERSON, MGR);
      const tags = (h.match(/<span class="tag[^"]*">[^<]*<\/span>/g) || []).join("");
      for (const w of words) assert.ok(!tags.includes(`>${w}<`), `一個人的頁面上還有「${w}」那個徽章`);
      const head = h.slice(at(h, "<h1>"), at(h, "</h1>"));
      assert.match(head, /who-member past/); assert.match(head, /who-speaker/); assert.match(head, /who-professor/);
      const edit = h.slice(at(h, "data-pedit"), at(h, 'data-act="person-save"'));
      assert.doesNotMatch(edit, /name="kind"/, "基本資料不再有種類那個下拉");
      assert.match(edit, /<input type="checkbox" name="hs" data-noauto="1">/, "只問還在不在念高中；來賓沒勾");
      const d = UI.peopleHTML(MGR.boot, { ...MGR, id: null, df: {}, pq: "", ptab: "dir" });
      const rows = d.slice(at(d, '<ul class="flist">'));
      for (const w of words) assert.ok(!rows.includes(`<span class="tag">${w}</span>`), `名錄的列上還有「${w}」`);
      assert.doesNotMatch(d, /<select name="kind"/, "名錄不再有身分那個下拉");
    } finally { zh(); }
  }
  const row = UI.peopleHTML(MGR.boot, { ...MGR, id: null, df: {}, pq: "", ptab: "dir" });
  assert.match(row, /<b>Nina Speaker<\/b><\/a> <span class="tag who-member past">校友（前幹部）<\/span> <span class="tag who-speaker">講者<\/span> <span class="tag who-professor">教授<\/span> <span class="tag ok">願意演講<\/span>/);
  assert.match(row, /<div class="fmeta rc-now">Machine learning・Engineer・Acme Labs・Taipei, Taiwan<\/div>/, "領域、職稱、單位、城市有填才印，自己一行");
  assert.equal(count(row, /class="fmeta rc-now"/g), 1, "沒填的人沒有那一行");
  // 學員那一格還勾著；成員沒有那一格，存的時候照舊是成員
  assert.match(UI.personHTML({ ...PERSON, person: { ...PERSON.person, kind: "student" } }, MGR), /name="hs" data-noauto="1" checked>/);
  assert.doesNotMatch(UI.personHTML({ ...PERSON, person: { ...PERSON.person, kind: "member" } }, MGR), /name="hs"/);
  assert.match(UI.personHTML({ ...PERSON, person: { ...PERSON.person, kind: "student", has_account: true } }, MGR), /name="hs" data-noauto="1" checked disabled>/, "有帳號的人照舊不能在這裡改");
  assert.equal(UI.kindFromForm("member", false), "member"); assert.equal(UI.kindFromForm("guest", true), "student"); assert.equal(UI.kindFromForm("student", false), "guest"); assert.equal(UI.kindFromForm("", false), "guest");
  // 加一個人：預設來賓，勾了才是學員；成員不在這裡加
  const add = UI.peopleHTML(MGR.boot, { ...MGR, id: null, df: {}, pq: "", ptab: "add" });
  assert.doesNotMatch(add, /name="kind"/); assert.match(add, /<input type="checkbox" name="hs" data-noauto="1">/); assert.match(add, /現在還在念高中/);
  assert.match(add, /幹部不用在這裡加，他們登入就有。/);
  const m = read("admin/records/src/main.js");
  assert.match(m, /D\.savePerson\(null, \{ name_zh: v\.name_zh, name_en: v\.name_en, email: v\.email, kind: UI\.kindFromForm\("", v\.hs\), school/);
  assert.match(m, /kind: UI\.kindFromForm\(\(\(S\.person \|\| \{\}\)\.person \|\| \{\}\)\.kind, v\.hs\), note: v\.note/);
  // 活動頁的清單那一行：沒有學校的人第二段是標籤，不是種類
  assert.equal(UI.dirLabel(DIR[0]), "Mia Member · 幹部"); assert.equal(UI.dirLabel(DIR[2]), "Sam Student · Test High · 2030");
  assert.equal(UI.dirLabel({ id: "x", name: "No Labels", kind: "guest", labels: [] }), "No Labels");
});

test("★ 一個人的頁面：四個分頁（基本資料、參與紀錄、故事與同意、設定），每一塊在它該在的分頁裡", () => {
  const h = UI.personHTML(PERSON, MGR);
  // 2026-11-24：十幾塊收成四個分頁。順序：他是誰 → BT 跟他的關係與時間軸 → 他自己寫的與同意的。
  // 2026-11-25：個人檔案排到最上面，基本資料在它的右邊（Paul：「her profile is like at the very last」）。
  const order = ['id="rc-profile"', "data-pedit", 'name="job_title"', 'id="rc-labels"', "data-cadd", "data-sadd", "data-paddev", 'id="rc-speaking"', "data-oadd", 'id="rc-story"', 'id="rc-consent"', 'id="rc-link-sec"'];
  const tabp = k => at(h, `<div class="tabp" data-ptabs="rc-person" data-tabp="${k}"`);
  assert.ok(tabp("details") < at(h, 'id="rc-profile"') && at(h, "data-sadd") < tabp("bt") && tabp("bt") < at(h, "data-paddev") && at(h, "data-oadd") < tabp("voice") && tabp("voice") < at(h, 'id="rc-story"'));
  assert.deepEqual([...h.matchAll(/data-ptab="rc-person" class="subtab(?: on)?" data-tab="([a-z]+)"/g)].map(m => m[1]), ["details", "bt", "voice", "settings"], "Co-President 四個都有");
  assert.ok(tabp("settings") < at(h, 'data-act="forget"') || /<div class="tabp" data-ptabs="rc-person" data-tabp="settings"[^>]*><section/.test(h), "移除的要求在「設定」分頁");
  const notPres = UI.personHTML(PERSON, { ...MGR, me: { pres: false } });
  assert.deepEqual([...notPres.matchAll(/data-ptab="rc-person" class="subtab(?: on)?" data-tab="([a-z]+)"/g)].map(m => m[1]), ["details", "bt", "voice"], "不是 Co-President 沒有「設定」分頁：裡面只有移除的要求，空的分頁不畫");
  for (let i = 1; i < order.length; i++) assert.ok(at(h, order[i - 1]) < at(h, order[i]), `${order[i - 1]} 要在 ${order[i]} 前面`);
  assert.doesNotMatch(h, /id="rc-rel"|rel_owner_who|rel_open|跟 BT 的關係|團隊裡誰認識他/, "2026-11-25「跟 BT 的關係」那一塊拿掉了（Paul：「that's pretty useless to me」）");
  for (const id of ["rc-labels", "rc-profile", "rc-story", "rc-consent", "rc-speaking", "rc-link-sec"]) assert.equal(count(h, new RegExp(`id="${id}"`, "g")), 1, `${id} 只有一塊`);
  // 去向多印學位或職稱
  assert.match(h, /<b>工作中<\/b> Acme Labs <span class="mini">2026<\/span><\/div><div class="fmeta">Staff Engineer・/);
  // 沒有當過講者就沒有那一塊；已經移除的人那幾塊都不畫
  assert.doesNotMatch(UI.personHTML({ ...PERSON, speaking: [] }, MGR), /id="rc-speaking"/);
  const gone = UI.personHTML({ ...PERSON, person: { ...PERSON.person, forgotten_at: "2026-12-02T00:00:00Z" }, labels: [], given: [], link: null }, MGR);
  assert.doesNotMatch(gone, /id="rc-(labels|profile|rel|story|consent|link-sec)"|data-autosave="pf-save"|data-act="link-create"/);
});

test("★ 個人檔案與關係：管的人每一格改了就存（一格一格送），看的人只讀；故事誰都只讀", () => {
  const m = UI.personHTML(PERSON, MGR), v = UI.personHTML(PERSON, VIEWER);
  const sec = (h, id, next) => h.slice(at(h, `id="${id}"`), at(h, `id="${next}"`));
  const mp = sec(m, "rc-profile", "rc-story"), vp = sec(v, "rc-profile", "rc-story");
  assert.match(mp, /<div class="rc-pf-f" data-autosave="pf-save" data-part="profile">/);
  for (const [name, val] of [["job_title", "Engineer"], ["job_org", "Acme Labs"], ["city", "Taipei"], ["country", "Taiwan"], ["field", "Machine learning"]])
    assert.match(mp, new RegExp(`<input name="${name}" value="${val}" maxlength="\\d+" autocomplete="off">`));
  assert.match(mp, /<textarea name="bio" rows="4" maxlength="600">第一行\n第二行<\/textarea>/);
  assert.match(mp, /<span class="autosave" data-for="pf-save">改了就存<\/span>/); assert.doesNotMatch(mp.slice(at(mp, 'class="rc-pf-f"'), at(mp, 'id="rc-labels"')), /data-act="[^"]*save"/, "現在的工作與介紹那幾格沒有「存起來」那顆鈕");
  assert.match(mp, /<div class="rc-pf-main"><h3 class="rc-pf-h">基本資料<\/h3><div data-pedit>[^]*data-act="person-save"[^]*<h3 class="rc-pf-h">現在的工作與介紹<\/h3>\s*<div class="rc-pf-f" data-autosave="pf-save" data-part="profile">/, "右邊那一欄：先基本資料（有自己的儲存），再現在的工作與介紹");
  assert.equal(count(m, /data-pedit/g), 1, "基本資料只畫一次，不會上面一份、下面又一份"); assert.doesNotMatch(vp, /data-pedit|rc-pf-main/, "看的人沒有那幾格");
  assert.match(mp, /<img class="rc-photo" src="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/people\/p1\/1-abc\.jpg" alt="">/);
  assert.match(mp, /<input type="file" accept="image\/jpeg,image\/png,image\/webp" data-act="pf-photo" data-noauto="1">/); assert.match(mp, /換一張照片/); assert.match(mp, /data-act="pf-photo-clear"/);
  assert.match(mp, /他自己在 2026-12-01 填過這一份。/);
  assert.doesNotMatch(vp, /<input|<textarea|<select|data-autosave|data-act=/, "看的人那一塊沒有任何一格、任何一顆鈕");
  assert.match(vp, /<div>Engineer・Acme Labs<\/div><div>Machine learning<\/div><div>Taipei, Taiwan<\/div><p class="rc-a">第一行<br>第二行<\/p>/);
  assert.match(sec(UI.personHTML({ ...PERSON, profile: { ...PROFILE, photo_url: null } }, MGR), "rc-profile", "rc-story"), /<span class="rc-photo" aria-hidden="true">N<\/span>[\s\S]*放一張照片/, "沒有照片：圓裡是名字的第一個字，沒有「拿掉照片」");
  assert.doesNotMatch(sec(UI.personHTML({ ...PERSON, profile: { ...PROFILE, photo_url: null } }, MGR), "rc-profile", "rc-story"), /pf-photo-clear/);
  assert.match(sec(UI.personHTML({ ...PERSON, profile: { story: {}, rel_open: "unknown" } }, VIEWER), "rc-profile", "rc-story"), /還沒有資料。/);
  // 故事：六題照順序，題目在上；沒寫的那幾題標出來；管的人也沒有任何一格
  for (const h of [m, v]) {
    const st = sec(h, "rc-story", "rc-consent");
    assert.doesNotMatch(st, /<input|<textarea|<select|data-autosave|data-act=/, "故事是他自己的話，誰都改不了");
    const qs = ["高中的你是什麼樣子？那時候想成為什麼樣的人？", "是哪一個轉捩點，讓你走上現在這條路？", "最難的一刻是什麼？你怎麼走過來的？", "有哪一個決定你會再做一次？哪一個你會改？", "你希望 17 歲的時候有人告訴你什麼？", "如果一個台灣學生想走你這條路，他第一步該做什麼？"];
    for (let i = 1; i < qs.length; i++) assert.ok(at(st, qs[i - 1]) < at(st, qs[i]));
    assert.match(st, /<div class="rc-q">高中的你是什麼樣子？那時候想成為什麼樣的人？<\/div><p class="rc-a">很安靜的人<\/p>/);
    assert.match(st, /<p class="rc-a">&lt;b&gt;不要怕&lt;\/b&gt;<\/p>/, "他寫的字要逃脫");
    assert.equal(count(st, /<p class="rc-a mini">這一題沒寫<\/p>/g), 4);
    assert.match(st, /他沒有同意引用。這些只給 BT 內部看，不要放到對外的地方。/);
  }
  assert.match(UI.personStoryHTML({ profile: { ...PROFILE, share_story: true } }), /他同意故事可以引用。/);
  assert.match(UI.personStoryHTML({ profile: { ...PROFILE, story: {} } }), /他還沒寫。故事是他自己的話，只有本人能在個人連結上寫，這裡改不了。/);
  en();
  try {
    const st = UI.personStoryHTML({ profile: { ...PROFILE, story: { turning: "x" } } });
    for (const q of ["What were you like in high school, and what did you want to become then?", "What was the turning point that set you on your current path?", "What was the hardest moment, and how did you get through it?",
      "What&#39;s one decision you&#39;d make again, and one you&#39;d change?", "What do you wish someone had told you at 17?", "If a Taiwanese student wanted your path, what should they do first?"]) assert.ok(st.includes(q), q);
  } finally { zh(); }
  // 當講者的活動：連到那一場的編輯頁
  assert.match(m, /<a href="\/admin\/\?lang=zh#events\/jan-talk"><b>一月分享會<\/b><\/a> <span class="tag draft">活動頁的同意還沒勾<\/span>/);
  assert.match(m, /<div class="fmeta">2027-01-03・Machine learning<\/div>/);
});

test("★ 自動儲存只送得出個人檔案那六個鍵；關係那四格 2026-11-25 起不送了", () => {
  assert.deepEqual(UI.PF_KEYS, ["city", "country", "job_title", "job_org", "field", "bio"]);
  assert.deepEqual(UI.profileFieldPatch("city", "  Taipei "), { patch: { city: "Taipei" } });
  assert.deepEqual(UI.profileFieldPatch("bio", ""), { patch: { bio: "" } }, "清空就是拿掉");
  for (const k of ["share_profile", "share_story", "offer_speak", "offer_mentor", "contact_ok", "photo_url", "story", "rel_owner", "rel_owner_who", "rel_open", "rel_last_contact", "rel_note", "hs", ""]) assert.equal(UI.profileFieldPatch(k, true), null, `${k} 不走自動儲存`);
  assert.equal(UI.personRelHTML, undefined); assert.equal(UI.teamOf, undefined);
  const m = read("admin/records/src/main.js");
  assert.match(m, /if \(act === "pf-save"\) return saveProfileField\(box, field\);\n  if \(!S\.results\) return;/, "個人檔案的自動儲存排在「沒有打開表單就不存」那一句前面");
  assert.match(m, /const id = S\.id, r = UI\.profileFieldPatch\(field\.name, field\.value\);/); assert.match(m, /await D\.saveProfile\(id, r\.patch\);/);
});

test("★ 加、改標籤：十一種都可以加；已經加過的每一種一塊（存、拿掉），沒加過的在「加一個標籤」的選單裡；只有管的人有編輯區", () => {
  const h = UI.personLabelsHTML(PERSON, MGR, true);
  assert.match(h, /<details class="fold rc-fold" data-glabels data-fold="people:p1:glabels">/, "收著，打開過的重畫之後還開著");
  const givenNow = (PERSON.given || []).map(g => g.label);
  assert.ok(givenNow.length >= 1, "測試資料裡至少有一個 BT 加的標籤");
  assert.deepEqual([...h.matchAll(/data-glabel="(\w+)"/g)].map(x => x[1]), [...UI.LABELS.filter(k => givenNow.includes(k)), "new"], "已經加過的各一塊，最後一塊是加新的");
  const prof = h.slice(at(h, 'data-glabel="professor"'), at(h, 'data-glabel="new"'));
  assert.match(prof, /<b>教授<\/b>/); assert.match(prof, /name="detail" value="[^"]+"/, "補充說明印出來可以改");
  assert.match(prof, /data-act="label-save" data-label="professor">存這個標籤<\/button><button class="btn quiet sm" data-act="label-del" data-label="professor">拿掉/);
  const add = h.slice(at(h, 'data-glabel="new"'));
  assert.match(add, /<b>加一個標籤<\/b>/);
  const opts = [...add.slice(0, at(add, "</select>")).matchAll(/<option value="(\w+)"/g)].map(x => x[1]);
  assert.deepEqual(opts, UI.LABELS.filter(k => !givenNow.includes(k)), "選單裡是還沒加過的每一種，幹部、學員、Mentor、講者都在");
  for (const k of ["member", "student", "mentor", "mentee", "speaker", "volunteer", "organizer"]) assert.ok(opts.includes(k), `選單裡沒有 ${k}`);
  assert.match(add, /data-act="label-save" data-label="">加上這個標籤<\/button>/, "加新的那顆按鈕不寫死是哪一種，看選單");
  assert.doesNotMatch(add, /label-del/);
  assert.match(add, /name="detail" value=""/); assert.match(add, /name="since" type="number" min="1950" max="2100" value=""/); assert.match(add, /name="until"/);
  assert.match(UI.personLabelsHTML(PERSON, { ...MGR, busy: true }, true), /data-act="label-save" data-label="" disabled>/);
  // 十一種都加過了就沒有「加一個標籤」那一塊
  assert.doesNotMatch(UI.personLabelsHTML({ ...PERSON, given: UI.LABELS.map(l => ({ label: l, detail: "", since: null, until: null })) }, MGR, true), /data-glabel="new"/);
  const v = UI.personLabelsHTML(PERSON, VIEWER, false);
  assert.doesNotMatch(v, /data-glabels|data-act=|<input/, "看的人只看得到標籤");
  assert.match(v, /who-professor/);
  const m = read("admin/records/src/main.js"), d = read("admin/records/src/data.js");
  assert.match(m, /const v = UI\.formValues\(box\), label = b\.dataset\.label \|\| v\.label; if \(!UI\.GIVEN_LABELS\.includes\(label\)\) return;/, "加新的那一塊看選單選了哪一種；不是十一種之一的不送");
  assert.match(m, /if \(del && UI\.needAsk\(S, b, T\("lab\.delAsk"\)\)\) return;/, "拿掉之前先問");
  assert.match(d, /rpc\("rc_label_set", \{ p_person: person, p_label: label, p_on: !!on, p_detail: detail \|\| "", p_since: since == null \? null : since, p_until: until == null \? null : until \}\)/);
});

test("★ 個人連結的四種狀態：沒有、有效（管的人）、有效（看的人）、過期；還在念高中的學員不開", () => {
  const sec = (d, S, can) => UI.personLinkHTML(d, S, can);
  assert.equal(UI.linkState(null), "none"); assert.equal(UI.linkState(LINK), "live"); assert.equal(UI.linkState({ ...LINK, expired: true }), "expired");
  assert.equal(UI.profileURL("a b"), "https://beyondtaiwannpo.com/profile/?t=a%20b");
  // 沒有
  const none = sec({ ...PERSON, link: null }, MGR, true);
  assert.match(none, /還沒有開連結。/); assert.match(none, /<button class="btn sm" data-act="link-create">開一條連結<\/button>/);
  assert.doesNotMatch(none, /rc-plink|link-copy|link-revoke|link-qr|id="rc-qr"/);
  assert.match(sec({ ...PERSON, link: null }, VIEWER, false), /還沒有開連結。/); assert.doesNotMatch(sec({ ...PERSON, link: null }, VIEWER, false), /data-act=/);
  // 有效，管的人：連結、複製、QR、開新的、撤銷，加一個留給 QR code 的空框
  const live = sec(PERSON, MGR, true), url = "https://beyondtaiwannpo.com/profile/?t=" + LINK.token;
  assert.match(live, /<span class="tag open">有效<\/span> 2026-11-20 開的，2027-02-18 過期。/);
  assert.match(live, /他在 2026-11-21 打開過。 還沒送出。/);
  assert.match(live, new RegExp(`<input id="rc-plink" readonly value="${url.replace(/[.?/]/g, "\\$&")}" data-noauto="1">`));
  assert.match(live, /data-act="link-copy">複製連結<\/button><button class="btn ghost sm" data-act="link-qr">顯示 QR code<\/button><button class="btn ghost sm" data-act="link-create">開一條新的<\/button><button class="btn quiet sm" data-act="link-revoke">撤銷</);
  assert.match(live, new RegExp(`<div id="rc-qr" data-link="${url.replace(/[.?/]/g, "\\$&")}"></div>`));
  assert.match(sec({ ...PERSON, link: { ...LINK, opened_at: null } }, MGR, true), /他還沒打開過。/);
  assert.match(sec({ ...PERSON, link: { ...LINK, submitted_at: "2026-11-22T02:00:00Z" } }, MGR, true), /他在 2026-11-22 送出過。/);
  // 有效，看的人：只有狀態（資料庫也不給 token）
  const seen = sec({ ...PERSON, link: { ...LINK, token: null } }, VIEWER, false);
  assert.match(seen, /<span class="tag open">有效<\/span>/); assert.match(seen, /連結本身只有管紀錄的人看得到。/);
  assert.doesNotMatch(seen, /rc-plink|data-act=|id="rc-qr"|profile\/\?t=/);
  assert.doesNotMatch(sec(PERSON, VIEWER, false), /tok0123|rc-plink|data-act=/, "就算手上有 token，看的人那一塊也不印");
  // 過期：不印舊連結，只有「開一條新的」
  const dead = sec({ ...PERSON, link: { ...LINK, expired: true } }, MGR, true);
  assert.match(dead, /<span class="tag closed">過期了<\/span> 這條連結在 2027-02-18 過期了，他打不開。要用的話開一條新的。/);
  assert.match(dead, /<button class="btn sm" data-act="link-create">開一條新的<\/button>/); assert.doesNotMatch(dead, /rc-plink|link-copy|link-revoke|tok0123/);
  // 還在念高中的學員（畢業年空的或還沒到）：沒有按鈕，講為什麼。跟資料庫的 minor_no_link 同一條
  const hs = { ...PERSON, link: null, person: { ...PERSON.person, kind: "student", grad_year: null } };
  assert.match(sec(hs, MGR, true), /還在念高中的學員不開個人連結，這條連結是給成年人用的：它會問同不同意對外，而未成年一律不對外。如果他已經畢業了，先在基本資料補上畢業年。/);
  assert.doesNotMatch(sec(hs, MGR, true), /data-act="link-create"/);
  assert.equal(UI.linkBlocked({ kind: "student", grad_year: null }, 2026), true); assert.equal(UI.linkBlocked({ kind: "student", grad_year: 2026 }, 2026), true);
  assert.equal(UI.linkBlocked({ kind: "student", grad_year: 2025 }, 2026), false); assert.equal(UI.linkBlocked({ kind: "guest", grad_year: null }, 2026), false);
  assert.match(read("supabase/migrations/2027-01-03-people-network.sql"), /pe\.kind = 'student' and \(pe\.grad_year is null or pe\.grad_year >= extract\(year from now\(\)\)::int\) then raise exception 'minor_no_link'/);
  assert.equal(says(new Error("minor_no_link")), RS.T("link.minor"));
  // main.js：已經有一條的時候先問；QR 還沒接的時候按了不出事
  const m = read("admin/records/src/main.js");
  assert.match(m, /if \(S\.person && S\.person\.link && UI\.needAsk\(S, b, T\("link\.renewAsk"\)\)\) return;/);
  assert.match(m, /if \(UI\.needAsk\(S, b, T\("link\.revokeAsk"\)\)\) return;\n    const r = await run\("err\.revoke", \(\) => D\.profileLink\(S\.id, "revoke"\)\);/);
  // QR code 是自己畫的（admin/records/src/qr.js），按了才載；畫不成就說一句，不留一個空框。
  assert.match(m, /const \{ qrSVG \} = await import\("\.\/qr\.js"\);\s*box\.innerHTML = UI\.qrBoxHTML\(qrSVG\(box\.dataset\.link, \{ px: 260 \}\)\);/);
  assert.match(UI.qrBoxHTML("<svg></svg>"), /class="rc-qrbox"><svg><\/svg><\/div><div class="mini">請他用手機的相機掃/);
  assert.match(UI.qrBoxHTML(""), /太長，畫不成 QR code/);
});

test("★ 同意只能取消：五格都只讀，勾著的兩個同意才有「替他取消」；整條路沒有一個地方送得出 true", () => {
  const h = UI.personConsentHTML(PERSON, MGR, true);
  assert.doesNotMatch(h, /<input|<select|<textarea|data-autosave/, "沒有任何一格可以勾");
  assert.match(h, /<li><span class="tag ok">有<\/span> 願意演講<\/li><li><span class="tag draft">沒有<\/span> 願意當 mentor<\/li><li><span class="tag ok">有<\/span> 可以聯絡他<\/li>/);
  assert.match(h, /<li><span class="tag ok">有<\/span> 名字、照片與職稱可以放在對外頁 <button class="btn quiet sm" data-act="pf-withdraw" data-k="share_profile">替他取消<\/button><\/li>/);
  assert.match(h, /<li><span class="tag draft">沒有<\/span> 故事可以引用<\/li>/, "沒勾的那一個沒有按鈕：這裡不能替他勾");
  assert.equal(count(h, /data-act="pf-withdraw"/g), 1);
  assert.match(h, /同意那兩格最後一次是 2026-12-01 改的。/);
  assert.match(h, /這幾格都是他自己在個人連結上勾的，這裡不能替他勾。BT 這邊只能替他取消同意，取消之後要放回來，也得他自己再勾一次。/);
  assert.equal(count(UI.personConsentHTML({ ...PERSON, profile: { ...PROFILE, share_story: true } }, MGR, true), /data-act="pf-withdraw"/g), 2);
  assert.doesNotMatch(UI.personConsentHTML({ ...PERSON, profile: { ...PROFILE, share_story: true } }, VIEWER, false), /data-act=/, "看的人沒有取消鈕");
  // 整頁：沒有任何一格叫 share_*、offer_*、contact_ok
  const page = UI.personHTML({ ...PERSON, profile: { ...PROFILE, share_story: true } }, MGR);
  assert.doesNotMatch(page, /name="(share_profile|share_story|offer_speak|offer_mentor|contact_ok)"/);
  for (const k of ["share_profile", "share_story"]) assert.ok(!UI.PF_KEYS.includes(k));
  // 資料層：share_* 只出現在兩個地方，一個是把它從 patch 拿掉，一個是寫死送 false
  const d = read("admin/records/src/data.js"), m = read("admin/records/src/main.js");
  assert.match(d, /delete patch\.share_profile; delete patch\.share_story;\n  return rpc\("rc_save_profile", \{ p_person: person, p: patch \}\);/);
  assert.match(d, /export const withdrawConsent = \(person, which\) => rpc\("rc_save_profile", \{ p_person: person, p: \{ \[which === "share_story" \? "share_story" : "share_profile"\]: false \} \}\);/);
  assert.doesNotMatch(d.replace(/\/\/[^\n]*/g, ""), /share_(profile|story)[^\n]*true/);
  assert.doesNotMatch(m.replace(/\/\/[^\n]*/g, ""), /share_profile|share_story/, "main.js 不自己組同意的鍵，只叫 withdrawConsent");
  assert.match(m, /if \(UI\.needAsk\(S, b, T\("cons\.withdrawAsk"\)\)\) return;\n    const ok = await run\("err\.save", \(\) => D\.withdrawConsent\(S\.id, b\.dataset\.k\)\);/);
  assert.equal(says(new Error("consent_needs_self")), "同意只有本人能勾，要請他在個人連結上勾。");
});

test("★ 名錄：標籤篩選（幹部與校友、學員與以前的學員分開，其他不分現在以前）、兩個快速篩選；原本的篩選照舊", () => {
  const ids = f => UI.filterDirectory(DIR, "", f).map(p => p.id);
  assert.deepEqual(ids({ label: "member" }), ["m1"]); assert.deepEqual(ids({ label: "member:past" }), ["p1"]);
  assert.deepEqual(ids({ label: "student" }), ["s1"]); assert.deepEqual(ids({ label: "student:past" }), ["s2"]);
  assert.deepEqual(ids({ label: "mentor" }), ["s2"], "Mentor 以前當過的也算");
  assert.deepEqual(ids({ label: "speaker" }), ["p1"]); assert.deepEqual(ids({ label: "professor" }), ["p1"]); assert.deepEqual(ids({ label: "connection" }), []);
  assert.deepEqual(ids({ speak: "1" }), ["p1"]); assert.deepEqual(ids({ mentor: "1" }), ["s2"]); assert.deepEqual(ids({ speak: "1", mentor: "1" }), []);
  assert.deepEqual(ids({ label: "student:past", mentor: "1", school: "Test High", grad: "2020" }), ["s2"], "跟原本的篩選可以一起用");
  assert.deepEqual(ids({ kind: "student" }), ["s1", "s2"]); assert.deepEqual(ids({ role: "none" }), ["p1", "s1", "s2"]); assert.deepEqual(UI.filterDirectory(DIR, "acme", {}).map(p => p.id), [], "搜尋照舊只找名字與學校");
  assert.equal(UI.labelFilterKey("mentor:past"), "mentor"); assert.equal(UI.labelFilterKey("member:past"), "member:past");
  assert.deepEqual(UI.dirOptions(DIR, []).label, [["member", 1], ["member:past", 1], ["student", 1], ["student:past", 1], ["mentor", 1], ["speaker", 1], ["professor", 1]], "選項照標籤的順序，帶人數");
  for (const k of ["label", "speak", "mentor", "who", "role", "team", "school", "grad", "term", "event", "country"]) assert.ok(UI.DIR_FILTERS.includes(k), k);
  const S = { ...MGR, id: null, df: {}, pq: "", ptab: "dir" };
  const h = UI.peopleHTML(MGR.boot, S);
  assert.match(h, /<select name="label" class="rc-dfilter" data-noauto="1"><option value="" selected>全部標籤<\/option><option value="member">幹部 \(1\)<\/option><option value="member:past">校友（前幹部） \(1\)<\/option>/);
  for (const k of ["role", "team", "school", "grad", "term", "event", "country"]) assert.match(h, new RegExp(`<select name="${k}" class="rc-dfilter"`), `${k} 那個下拉還在`);
  // 「當過」那個舊下拉跟「標籤」講的是同一件事、人數卻不一樣（標籤的講者含活動頁連到他的），有標籤之後就不畫，免得兩個並排讓人不知道該信哪一個。
  assert.doesNotMatch(h, /<select name="who" class="rc-dfilter"/);
  assert.match(h, /<button type="button" class="chip sm" aria-pressed="false" data-act="dir-quick" data-k="speak">願意演講<\/button><button type="button" class="chip sm" aria-pressed="false" data-act="dir-quick" data-k="mentor">願意當 mentor<\/button>/);
  const on = UI.peopleHTML(MGR.boot, { ...S, df: { speak: "1", label: "speaker" } });
  assert.match(on, /class="chip sm on" aria-pressed="true" data-act="dir-quick" data-k="speak"/); assert.match(on, /<option value="speaker" selected>講者 \(1\)<\/option>/);
  assert.match(on, /1 個人（全部 4）/); assert.match(on, /data-act="dir-clear"/, "快速篩選也算在「清掉篩選」裡");
  const m = read("admin/records/src/main.js");
  assert.match(m, /if \(act === "dir-quick"\) \{ const k = b\.dataset\.k === "mentor" \? "mentor" : "speak"; S\.df = \{ \.\.\.\(S\.df \|\| \{\}\), \[k\]: \(S\.df \|\| \{\}\)\[k\] \? "" : "1" \}; S\.dirN = 0; render\(\); return; \}/);
});

test("★ 遷移檔還沒跑：一個人的頁面與名錄都照舊（印原本的身分），多一句說要跑 2027-01-03-people-network.sql", () => {
  // rc_person 舊版：沒有 labels、profile、link、given、speaking
  const old = { person: { id: "p9", name: "Old Row", kind: "guest", school: "Test High" }, participation: [{ id: "x1", event_id: "e1", event: "Camp", kind: "bootcamp", role: "speaker", status: "attended" }], pairs: [], outcomes: [], responses: [] };
  const h = UI.personHTML(old, MGR);
  assert.match(h, /<div class="note">標籤、個人檔案與個人連結還不在資料庫裡，要先在 Supabase 跑 2027-01-03-people-network\.sql。跑之前這一頁照舊。<\/div>/);
  assert.match(h, /<h1>Old Row <span class="tag">來賓<\/span> <span class="tag who-speaker">講者<\/span><\/h1>/, "頁首照舊是身分加當過什麼");
  assert.doesNotMatch(h, /id="rc-(labels|profile|rel|story|consent|speaking|link-sec)"|data-autosave="pf-save"|link-create|pf-photo/);
  for (const keep of ["data-pedit", "data-cadd", "data-sadd", "data-paddev", "data-oadd", 'data-act="forget"']) assert.ok(h.includes(keep), `原本的 ${keep} 還在`);
  assert.equal(count(h, /2027-01-03-people-network\.sql/g), 1, "只講一次");
  // labels 有、profile 沒有（半套）也當成還沒跑，不畫一半
  assert.doesNotMatch(UI.personHTML({ ...old, labels: [] }, MGR), /id="rc-profile"/);
  // 名錄：列上沒有 labels，照舊印身分與「身分」那個下拉，沒有快速篩選
  const dir = [{ id: "a", name: "Old Row", kind: "guest", school: "Test High", has_account: false, roles: ["speaker"], terms: [], events: [], countries: [], n: 1 }];
  const d = UI.peopleHTML(MGR.boot, { ...MGR, id: null, dir, df: {}, pq: "", ptab: "dir" });
  assert.match(d, /2027-01-03-people-network\.sql/); assert.match(d, /<select name="kind" class="rc-dfilter"/); assert.doesNotMatch(d, /<select name="label"|dir-quick/);
  assert.match(d, /<b>Old Row<\/b><\/a> <span class="tag">來賓<\/span> <span class="tag who-speaker">講者<\/span>/);
  assert.equal(UI.dirLabel({ id: "c", name: "No School", kind: "member" }), "No School · 成員", "清單那一行也照舊");
  // 空的名錄不算沒跑：不為了零個人印那一句
  assert.doesNotMatch(UI.peopleHTML(MGR.boot, { ...MGR, id: null, dir: [], df: {}, pq: "", ptab: "dir" }), /people-network\.sql/);
  // 新的三支函式還不在的時候按了按鈕：講要跑哪一支，不印 PostgREST 的原文
  for (const fn of ["rc_label_set", "rc_save_profile", "rc_profile_link"])
    assert.equal(says(new Error(`Could not find the function public.${fn}(p_person) in the schema cache`)), "這個功能還不在資料庫裡，要先在 Supabase 跑 2027-01-03-people-network.sql。");
  assert.equal(saysUpload(new Error("Bucket not found")), "放照片的地方還不在，要先在 Supabase 跑 2027-01-03-people-network.sql。");
});

test("資料庫回的代碼都有一句人話；照片的幾個純函式", () => {
  assert.equal(says(new Error("bad_label")), "這一種標籤資料庫還不收，要先在 Supabase 跑 2027-01-06-labels-and-schools.sql。");
  assert.equal(says(new Error("bad_years")), "結束的年份不能比開始的早，而且要在 1950 到 2100 之間。");
  assert.equal(says(new Error("bad_rel_open")), "「他多願意幫忙」那一格的值不對，重新選一次。");
  assert.equal(says(new Error("photo_not_https")), "照片的網址要是 https 開頭。");
  assert.equal(says(new Error("too_long:bio")), "介紹太長了，最多 600 個字。"); assert.equal(says(new Error("too_long:rel_note")), "備註太長了，最多 2000 個字。");
  assert.match(says(new Error("too_long:job_org")), /職稱、單位、領域最多 120 個字/);
  assert.equal(says(new Error("too_long")), RS.T("says.tooLong"), "聯絡方式原本那一句沒有被蓋掉");
  assert.equal(says(new Error("not_records_manager")), RS.T("says.notManager")); assert.equal(says(new Error("no_such_person")), RS.T("says.noPerson"));
  assert.equal(saysUpload(new Error("new row violates row-level security policy")), RS.T("says.notManager"), "不是管紀錄的人傳照片：講權限，不是講「資料庫擋下來了」");
  assert.equal(saysUpload(new Error("The object exceeded the maximum allowed size")), RS.T("says.photoBig"));
  assert.equal(UI.personStoragePath(PROFILE.photo_url), "p1/1-abc.jpg"); assert.equal(UI.personStoragePath("https://x.supabase.co/storage/v1/object/public/events/e1/a.jpg"), "", "別的 bucket 的檔不歸這裡刪");
  assert.equal(UI.personStoragePath(""), ""); assert.equal(UI.personStoragePath("https://example.com/a.jpg"), "");
  assert.equal(UI.photoFileOk({ type: "image/png" }), true); assert.equal(UI.photoFileOk({ type: "image/heic" }), false); assert.equal(UI.photoFileOk(null), false);
  assert.deepEqual(UI.photoFit(1600, 1200), { w: 800, h: 600 }); assert.deepEqual(UI.photoFit(400, 300), { w: 400, h: 300 });
  const d = read("admin/records/src/data.js");
  assert.match(d, /supabase\.storage\.from\("people"\)\.upload\(name, blob, \{ contentType: "image\/jpeg", cacheControl: "31536000", upsert: false \}\)/);
  assert.match(d, /const name = `\$\{personId\}\/\$\{Date\.now\(\)\}-\$\{Math\.random\(\)\.toString\(36\)\.slice\(2, 8\)\}\.jpg`;/, "路徑是人的 id 加時間加亂數，不用原檔名");
  assert.match(read("supabase/migrations/2027-01-03-people-network.sql"), /values \('people', 'people', true, 5242880, array\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/);
});

test("★ 英文畫出來不剩中文（假資料全用英文）", () => {
  const cjk = /[一-鿿]/;
  const P = { ...PERSON, profile: { ...PROFILE, bio: "Line", story: { highschool: "Quiet" }, rel_note: "Met at a conference" }, speaking: [{ ...PERSON.speaking[0], event: "January talk" }] };
  en();
  try {
    for (const [name, h] of [["manager", UI.personHTML(P, MGR)], ["viewer", UI.personHTML(P, VIEWER)], ["expired link", UI.personLinkHTML({ ...P, link: { ...LINK, expired: true } }, MGR, true)],
      ["no link", UI.personLinkHTML({ ...P, link: null }, MGR, true)], ["minor", UI.personLinkHTML({ ...P, link: null, person: { ...P.person, kind: "student" } }, MGR, true)],
      ["directory", UI.peopleHTML(MGR.boot, { ...MGR, id: null, df: {}, pq: "", ptab: "dir" })], ["add", UI.peopleHTML(MGR.boot, { ...MGR, id: null, df: {}, pq: "", ptab: "add" })],
      ["not migrated", UI.personHTML({ person: { id: "p9", name: "Old Row", kind: "guest" }, participation: [], pairs: [], outcomes: [], responses: [] }, MGR)]]) {
      const left = h.replace(/ placeholder="[^"]*"/g, "").match(cjk);
      assert.equal(left, null, `${name} 還剩中文：…${left ? h.slice(Math.max(0, left.index - 60), left.index + 30) : ""}…`);
    }
  } finally { zh(); }
});

// ── 活動編輯頁挑講者（admin/src）──
const EV = { id: "e1", slug: "jan-talk", status: "draft" };
const NINA = { id: "p1", name: "Nina Speaker", kind: "guest", school: "Test High", labels: ["member:past", "speaker"], latest: "Latest University",
  card: { field: "Machine learning", job_title: "Engineer", job_org: "Acme Labs", photo_url: "https://x.supabase.co/storage/v1/object/public/people/p1/1-abc.jpg" } };

test("★ 挑講者：從紀錄帶入名字、主題、學校、照片，只填空的格子；同意不在帶入的東西裡", () => {
  const d = F.evSpeakerPrefill(null, NINA);
  assert.deepEqual({ display_name: d.display_name, subject: d.subject, school: d.school, photo_url: d.photo_url, person_id: d.person_id, from: d.from },
    { display_name: "Nina", subject: "Machine learning", school: "Acme Labs", photo_url: NINA.card.photo_url, person_id: "p1", from: "Nina Speaker" });
  assert.ok(!("consent" in d), "同意不是帶入的東西");
  // 已經打了字的格子不蓋
  const typed = F.evSpeakerPrefill({ display_name: "Dr. N", subject: "My own topic", school: "" }, NINA);
  assert.equal(typed.display_name, "Dr. N"); assert.equal(typed.subject, "My own topic"); assert.equal(typed.school, "Acme Labs"); assert.equal(typed.photo_url, NINA.card.photo_url);
  assert.equal(F.evSpeakerPrefill({ school: "   " }, NINA).school, "Acme Labs", "只有空白算空的");
  // 學校：個人檔案的單位 → 最近一筆去向 → 名單上的學校
  assert.equal(F.evSpeakerPrefill(null, { ...NINA, card: { ...NINA.card, job_org: "" } }).school, "Latest University");
  assert.equal(F.evSpeakerPrefill(null, { ...NINA, card: null, latest: null }).school, "Test High");
  // 沒有個人檔案（card 是 null）、遷移檔還沒跑（沒有 card、labels、latest）：跟以前一樣只帶名字與學校
  const bare = F.evSpeakerPrefill(null, { id: "p2", name: "王小明", school: "Test High", kind: "student" });
  assert.deepEqual({ display_name: bare.display_name, subject: bare.subject, school: bare.school, photo_url: bare.photo_url }, { display_name: "王小明", subject: "", school: "Test High", photo_url: "" });
  // 挑錯人再挑一次：上一次帶入、沒改過的格子換成新的那個人的；自己改過的那一格留著
  const first = F.evSpeakerPrefill(null, NINA);
  const second = F.evSpeakerPrefill({ ...first, subject: "I changed this" }, { id: "p3", name: "Omar Other", school: "", labels: ["speaker"], latest: null, card: { field: "Design", job_title: "", job_org: "", photo_url: null } });
  assert.deepEqual({ display_name: second.display_name, subject: second.subject, school: second.school, photo_url: second.photo_url, person_id: second.person_id, from: second.from },
    { display_name: "Omar", subject: "I changed this", school: "", photo_url: "", person_id: "p3", from: "Omar Other" }, "上一個人的學校與照片不會留在新的人身上");
  // 不連到這個人了：字留著，紀錄帶來的照片拿掉；自己另外放的照片網址不動
  const un = F.evSpeakerUnpick(first);
  assert.deepEqual({ display_name: un.display_name, school: un.school, photo_url: un.photo_url, person_id: un.person_id, from: un.from }, { display_name: "Nina", school: "Acme Labs", photo_url: "", person_id: null, from: "" });
  assert.deepEqual(F.EV_SP_FILL, ["display_name", "subject", "school", "photo_url"]);
  // main.js：挑人只叫這一支
  const m = read("admin/src/main.js");
  assert.match(m, /S\.evSpDraft = p \? UI\.evSpeakerPrefill\(S\.evSpDraft, p\)/);
  assert.match(m, /: UI\.evSpeakerUnpick\(S\.evSpDraft\);/);
  // 2026-11-25 起「加一位」有一格「放在對外頁」，加完照它存。沒動過那一格：從紀錄挑了現在是學員的先不對外，其他人對外。
  assert.equal(count(m, /D\.setEventSpeakerConsent\(/g), 2, "講者的同意只有兩個地方會動：keepSpeakerShown（加完或改完補回去），還有按「放上對外頁／收起來」");
  const add = m.slice(at(m, 'if (act === "ev-sp-add" || act === "ev-sp-save") {'), at(m, 'if (act === "ev-sp-move"'));
  assert.match(add, /const dr = S\.evSpDraft \|\| \{\};\s*const shown = adding \? \(dr\.show == null \? !\(dr\.person_id && dr\.minor\) : !!dr\.show\) : !!row\.consent;/, "加一位照那一格；改既有的那一位照他本來看不看得到");
  assert.match(add, /if \(shown && sid\) await keepSpeakerShown\(sid\);/);
  assert.match(add, /T\(adding \? \(!shown \? "msg\.evSpAddedHidden" :/, "沒放上對外頁的那一句講怎麼放");
  const stuDraft = F.evSpeakerPrefill(null, { id: "s1", name: "Sam Student", labels: ["student"] });
  assert.equal(stuDraft.show, false, "挑了學員：那一格先不勾"); assert.equal(F.evSpeakerPrefill(null, NINA).show, true); assert.equal(F.evSpeakerPrefill({ show: false }, NINA).show, true, "再挑一個人，那一格照新的那個人");
  assert.equal(F.evMaybeMinor({ labels: ["student"] }), true); assert.equal(F.evMaybeMinor({ labels: ["student:past", "mentor"] }), false, "畢業了的學員不算");
  assert.equal(F.evMaybeMinor({ kind: "student" }), true, "遷移檔還沒跑（沒有 labels）看種類"); assert.equal(F.evMaybeMinor({ kind: "member" }), false); assert.equal(F.evMaybeMinor(null), false);
  assert.equal(F.evSpeakerPrefill(null, { id: "s1", name: "Sam Student", labels: ["student"] }).minor, true); assert.equal(F.evSpeakerPrefill(null, NINA).minor, false);
  assert.equal(F.evSpeakerUnpick(F.evSpeakerPrefill(null, { id: "s1", name: "Sam Student", labels: ["student"] })).minor, false, "不連到這個人了就不算");
  assert.match(add, /copied = await copyRecordsPhoto\(ev\.id, from\); patch\.photo_url = copied;/, "照片抄一份到 events bucket，不直接用紀錄那邊的網址");
  assert.match(add, /if \(copied\) await D\.removeEventFile\(UI\.evStoragePath\(copied\)\);/, "講者沒加成就把抄過來的檔刪掉");
  assert.match(read("supabase/migrations/2027-01-02-event-speakers-tickets.sql"), /insert into event_speakers \(event_id, person_id, display_name, subject, school, photo_url, consent, sort, created_by\)/);
});

test("★ 挑講者的清單：每一個人後面印標籤與現在做什麼；學員就標「學員」，沒有警告色；遷移檔沒跑照舊印身分", () => {
  const found = [NINA, { id: "s1", name: "Sam Student", school: "Test High", kind: "student", labels: ["student"], card: null, latest: null },
    { id: "s2", name: "Olga Oldstudent", school: "", kind: "student", labels: ["student:past", "mentor:past", "from_the_future"], card: null, latest: null }];
  const h = F.eventSpeakersHTML(EV, [], true, false, { canPick: true, spOpen: true, spQ: "s", spFound: found, spDraft: F.evSpeakerPrefill(null, NINA) });
  assert.match(h, /<li><b>Nina Speaker<\/b> <span class="mini">Test High<\/span> <span class="mini">Latest University<\/span> <span class="mini">Machine learning・Acme Labs<\/span> <span class="tag past">校友（前幹部）<\/span> <span class="tag">講者<\/span> <a class="mini ev-sp-open" href="\/admin\/records\/\?lang=zh#people\/p1">看他的那一頁<\/a> <button class="btn ghost sm" data-act="ev-sp-pick" data-id="p1">帶入<\/button><\/li>/);
  assert.match(h, /<li><b>Sam Student<\/b> <span class="mini">Test High<\/span> <span class="tag">學員<\/span> <a class="mini ev-sp-open"/); assert.doesNotMatch(h, /tag warn|未成年/);
  // 2026-11-25 Paul：「if they have a Chinese name and last name, I should know… where they go to school, which is also very important」。
  // 資料庫回了 name_zh／name_en（2027-01-07-speaker-profiles.sql）就多印跟大字不一樣的那一個；最近的去向跟名單上的學校不一樣也印。
  const rich = F.eventSpeakersHTML(EV, [], true, false, { canPick: true, spFound: [{ id: "a1", name: "Alicia Lee", name_zh: "李艾莉", name_en: "Alicia Lee", school: "北一女中", latest: "National Taiwan University", labels: ["student:past"], card: null }] });
  assert.match(rich, /<li><b>Alicia Lee<\/b> <b class="ev-sp-alt">李艾莉<\/b> <span class="mini">北一女中<\/span> <span class="mini">National Taiwan University<\/span> <span class="tag past">以前的學員<\/span>/);
  assert.equal(F.evOtherName({ name: "王小明", name_zh: "王小明", name_en: "" }), ""); assert.equal(F.evOtherName({ name: "Alicia Lee" }), "", "資料庫還沒回那兩格就不印");
  assert.equal(F.evOtherName({ name: "Alicia Lee", name_zh: "李艾莉", name_en: "Alicia Lee" }), "李艾莉"); assert.equal(F.evOtherName(null), "");
  assert.equal(F.evPersonHref("p 1"), "/admin/records/?lang=zh#people/p%201");
  assert.match(h, /<li><b>Olga Oldstudent<\/b> <span class="tag past">以前的學員<\/span> <span class="tag past">Mentor<\/span> <a class="mini ev-sp-open"/, "畢業了的學員是「以前的學員」；認不得的代碼不印");
  assert.doesNotMatch(h, />來賓<|>成員</, "有標籤的時候不印種類");
  // 帶入之後那幾格與那張照片
  assert.match(h, /id="ev-sp-new-name" value="Nina"/); assert.match(h, /<input data-f="subject" value="Machine learning"/); assert.match(h, /<input data-f="school" value="Acme Labs"/);
  assert.match(h, /<p class="ev-line ev-sp-from"><img class="ev-sp-pic sm" src="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/people\/p1\/1-abc\.jpg" alt=""> <span>加進來的時候會抄一份紀錄裡的這張照片。<\/span> <button class="btn quiet sm" data-act="ev-sp-nophoto">不用這張照片<\/button><\/p>/);
  assert.doesNotMatch(h, /紀錄裡這個人是學員/, "帶入的不是學員就沒有那一句");
  const stu = F.eventSpeakersHTML(EV, [], true, false, { canPick: true, spOpen: true, spDraft: F.evSpeakerPrefill(null, found[1]) });
  assert.doesNotMatch(stu, /未成年|<div class="note">/, "帶入的是學員：沒有那一句了"); assert.match(stu, /id="ev-sp-new-show"><span>放在對外頁/, "只是那一格先不勾");
  assert.doesNotMatch(F.eventSpeakersHTML(EV, [], true, false, { canPick: true, spOpen: true, spDraft: { display_name: "X" } }), /ev-sp-from|ev-sp-nophoto/, "沒有帶照片就沒有那一行");
  // 遷移檔還沒跑：rc_find_people 回的列沒有 labels，照舊
  const old = F.eventSpeakersHTML(EV, [], true, false, { canPick: true, spFound: [{ id: "p8", name: "Sam Student", school: "Test High", kind: "student" }, { id: "p9", name: "Gina Guest", school: "", kind: "guest" }] });
  assert.match(old, /<b>Sam Student<\/b> <span class="mini">Test High<\/span> <span class="tag">學員<\/span>/); assert.match(old, /<b>Gina Guest<\/b> <span class="tag">來賓<\/span>/);
  assert.equal(F.evLabelName("member:past"), "校友（前幹部）"); assert.equal(F.evLabelName("student:past"), "以前的學員"); assert.equal(F.evLabelName("nope"), "");
  assert.match(read("admin/src/main.js"), /if \(act === "ev-sp-pick" \|\| act === "ev-sp-unpick" \|\| act === "ev-sp-nophoto"\) \{/);
});

// ── 現在在哪：學校與去向排成一條（2026-11-25）──────────────────────────
// Paul：「she used to be a student, but now she is in University of Washington… AIA… is her current school, which is not right…
// always put university or job in a chronologically order. And put the latest as their current status」。
test("★ 現在在哪：去向（就讀、轉學、畢業、工作）與學校排成一條，最新的在最上面；申請與錄取不算；頁首印的是第一列", () => {
  const sch = (id, school, yf, yt, current) => ({ id, school, year_from: yf, year_to: yt, source: "import", note: "", current: !!current });
  const out = (id, kind, institution, year, extra) => ({ id, kind, institution, year, title: "", major: "", country: "", note: "", source: "import", visibility: "internal", ...(extra || {}) });
  const names = d => UI.placesOf(d).map(x => x.name);
  assert.deepEqual(UI.PLACE_OKINDS, ["enrolled", "transferred", "graduated", "working"]);
  // Paul 看到的那一個：高中在學校那邊（沒有年份、名單上那一所），大學在去向那邊（沒有年份）。大學排前面
  const angel = { schools: [sch("s1", "American International Academy", null, null, true)], outcomes: [out("o1", "enrolled", "University of Washington", null)] };
  assert.deepEqual(names(angel), ["University of Washington", "American International Academy"]);
  assert.equal(UI.placesOf(angel)[0].from, "outcome");
  // 申請、錄取、gap、其他不算：高三錄取了，現在還是高中
  assert.deepEqual(names({ schools: [sch("s1", "TFG", 2023, null, true)], outcomes: [out("o1", "admitted", "NTU", 2026), out("o2", "applied", "MIT", 2026), out("o3", "gap", "", 2026), out("o4", "other", "X", 2026)] }), ["TFG"]);
  // 有年份的新到舊；沒年份的去向接在有年份的去向後面，還是在學校前面
  assert.deepEqual(names({ schools: [sch("s1", "HS A", 2015, 2018), sch("s2", "HS B", 2018, 2021, true)],
    outcomes: [out("o1", "graduated", "UCLA", 2025), out("o2", "working", "Acme", 2026), out("o3", "enrolled", "Somewhere", null)] }), ["Acme", "UCLA", "Somewhere", "HS B", "HS A"]);
  // 只記在學校那邊、年份比每一筆去向都晚的那一所排最前面（工作之後又回去念書）
  assert.deepEqual(names({ schools: [sch("s1", "HS", 2015, 2018), sch("s2", "Stanford GSB", 2027, null)], outcomes: [out("o1", "working", "Acme", 2024)] }), ["Stanford GSB", "Acme", "HS"]);
  // 去向有一筆沒年份，就不讓學校插到前面（不知道誰比較晚，大學與工作優先）
  assert.deepEqual(names({ schools: [sch("s1", "HS", 2024, 2026, true)], outcomes: [out("o1", "enrolled", "UW", null)] }), ["UW", "HS"]);
  // 同一個名字兩邊都有，只留去向那一列（不分大小寫、前後空白）
  assert.deepEqual(UI.placesOf({ schools: [sch("s1", " university of washington ", 2022, null), sch("s2", "AIA", 2018, 2022)], outcomes: [out("o1", "enrolled", "University of Washington", 2022)] }).map(x => x.from + ":" + x.name), ["outcome:University of Washington", "school:AIA"]);
  // 只有學校：名單上那一所排前面（都沒年份的時候）
  assert.deepEqual(names({ schools: [sch("s1", "Old", null, null), sch("s2", "Listed", null, null, true)], outcomes: [] }), ["Listed", "Old"]);
  assert.deepEqual(UI.placesOf({}), []); assert.deepEqual(UI.placesOf(null), []);
  // 一個人的頁面：第一列標「現在」，頁首那一行印的是現在在哪，不是名單上那一格學校
  const d = { ...PERSON, person: { ...PERSON.person, school: "American International Academy", grad_year: 2022 }, schools: angel.schools, outcomes: angel.outcomes };
  const h = UI.personHTML(d, MGR);
  assert.match(h, /<li><div class="fhead"><b>University of Washington<\/b> <span class="tag open">現在<\/span> <span class="tag">就讀中<\/span><\/div><div class="fmeta">從去向來的，到「參與紀錄」改<\/div><\/li>/);
  assert.equal(count(h, /<span class="tag open">現在<\/span>/g), 1);
  assert.match(h, /<b>American International Academy<\/b><\/div><div class="fmeta">匯入 <button class="btn quiet sm" data-act="school-del" data-id="s1">/, "學校那一列管的人可以刪；去向那一列在去向那一塊改");
  assert.doesNotMatch(h.slice(at(h, "<ul class=\"flist rc-places\">"), at(h, "data-sadd")), /data-act="out-del"/);
  const head = h.slice(0, at(h, "rc-profile"));
  assert.match(head, /University of Washington/); assert.doesNotMatch(head, /American International Academy|2022/, "頁首不再印高中與它的畢業年");
  // 還在那一所高中的人照舊印學校與畢業年
  const hs = UI.personHTML({ ...PERSON, person: { ...PERSON.person, kind: "student", school: "TFG", grad_year: 2027 }, schools: [sch("s1", "TFG", 2024, null, true)], outcomes: [] }, MGR);
  assert.match(hs.slice(0, at(hs, "rc-profile")), /TFG・2027/);
  assert.match(UI.personHTML({ ...PERSON, schools: [], outcomes: [] }, MGR), /還沒有學校或工作的紀錄。/);
  const m = read("admin/records/src/main.js"), dd = read("admin/records/src/data.js");
  assert.doesNotMatch(m + dd, /school-current|setCurrentSchool/, "「設成現在的」那顆按鈕與它叫的函式都拿掉了");
});

test("★ 2027-01-06 那一支：念大學或工作了就不算還在念高中；只認四種去向、錄取不算；有帳號的學員不動；標籤合成一列", () => {
  const sql = read("supabase/migrations/2027-01-06-labels-and-schools.sql"), code = sql.replace(/--[^\n]*/g, "");
  assert.match(code, /create trigger rc_outcomes_left_school after insert or update of kind, year on public\.rc_outcomes\s+for each row execute function public\.rc_left_school_trg\(\);/);
  const trg = code.slice(code.indexOf("function public.rc_left_school_trg()"), code.indexOf("drop trigger if exists rc_outcomes_left_school"));
  assert.match(trg, /if new\.kind not in \('enrolled', 'transferred', 'graduated', 'working'\) then return new; end if;/); assert.doesNotMatch(trg, /'admitted'|'applied'/, "錄取、申請不算");
  assert.deepEqual(trg.match(/not in \(([^)]*)\)/)[1].replace(/'/g, "").split(", "), UI.PLACE_OKINDS, "跟畫面排「現在在哪」用的是同一份清單");
  assert.match(trg, /if new\.year is not null and new\.year > extract\(year from now\(\)\)::int then return new; end if;/, "還沒到的年份不算");
  assert.match(trg, /if pe\.id is null or pe\.kind <> 'student' or pe\.profile_id is not null then return new; end if;/, "有自己帳號的學員不動");
  assert.match(trg, /update public\.people set kind = 'guest' where id = pe\.id;/, "跟在畫面上取消「現在還在念高中」一樣");
  assert.equal(UI.kindFromForm("student", false), "guest");
  assert.match(trg, /values \(pe\.id, 'student', '', null, new\.year::smallint, null\) on conflict \(person_id, label\) do nothing;/, "留一個「學員」標籤，他還是看得出以前是學員");
  assert.match(trg, /rc_log_it\('left_high_school'/);
  assert.match(code, /when o\.label = 'student' then coalesce\(\(select kind = 'student' and \(grad_year is null or grad_year >= cur\.y\) from pe\), false\)/, "現在還是學員一定要那一格勾著，光給標籤不算");
  assert.match(code, /if not public\.rc_can_manage\(\) then raise exception 'not_records_manager'/);
  assert.match(code, /revoke all on function public\.rc_labels_of\(uuid\) from public, anon, authenticated;/); assert.match(code, /revoke all on function public\.rc_left_school_trg\(\) from public, anon, authenticated;/);
  assert.doesNotMatch(code, /create policy|alter policy|grant select|grant all|to anon/, "沒有動 RLS，沒有開給沒登入的人");
  assert.doesNotMatch(code, /rc_profile_link|minor_no_link/, "個人連結那道門這一支沒有碰");
  // 驗收表：每一列都有 PASS／FAIL，第 9 列只是印數字
  assert.equal(count(sql, /union all select \d+, /g), 10); assert.match(sql, /'OVERALL'/);
  assert.match(read("scripts/db/smoke.sh"), /LSM=supabase\/migrations\/2027-01-06-labels-and-schools\.sql/, "smoke.sh 有跑這一支（它的清單是寫死的，新增遷移檔要自己加）");
});
