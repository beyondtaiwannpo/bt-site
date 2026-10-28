// 把老幹部請回來（2026-11-07）：名單上沒有帳號的紀錄直接寄邀請信、一次寄一批、邀請頁同名掛到既有紀錄、校友登入後的歡迎卡。
// 資料庫那一半在 scripts/db/smoke.sh（invite_back、invite_back_many、roster_invites、十三參數的 invite_person、dismiss_alumni_welcome）。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rosterHTML, personEditHTML, invitesPageHTML, inviteFormNewHTML, changesHTML,
  inviteBadgeHTML, inviteBackHTML, bulkPanelHTML, bulkRows, bulkPayload, bulkSummary, mergeInvites,
  nameMatches, inviteChooserHTML, ambiguousIds, setLang, T } from "../admin/people/src/ui.js";
setLang("zh");
import { says } from "../admin/people/src/data.js";
import { settingsHTML, welcomeHTML, showWelcome, setLang as settingsLang } from "../settings/src/ui.js";
settingsLang("zh");

const ME = "11111111-1111-1111-1111-111111111111";
const TERMS = [
  { id: "2026-27", title_zh: "2026-27 屆", title_en: "TERM 2026-27", starts_on: "2026-08-01", ends_on: "2027-07-31", status: "current" },
  { id: "2024-25", title_zh: "", title_en: "", starts_on: "2024-08-01", ends_on: "2025-07-31", status: "ended" },
];
const PEOPLE = [
  { person_id: "p1", profile_id: ME, name_zh: "王平", name_en: "Paul", role: "cadre", board_role: "president", team: "",
    positions: [{ term: "2026-27", title_en: "Co-President", team: "" }], workspaces: [], maybe_dup: null },
  { person_id: "p4", profile_id: null, name_zh: "陳回來", name_en: "Comeback Chen", email: "comeback@example.com",
    positions: [{ term: "2024-25", title_en: "Associate, Marketing Team", team: "Marketing Team" }], workspaces: [], maybe_dup: null },
  { person_id: "p5", profile_id: null, name_zh: "", name_en: "Comeback Two", positions: [], workspaces: [], maybe_dup: null },
  { person_id: "p6", profile_id: null, name_zh: "老幹部", name_en: "Old Cadre", positions: [{ term: "2024-25", title_en: "Director, Curriculum Team", team: "Curriculum Team" }],
    workspaces: [], pending_code: "bt-old-01", maybe_dup: null },
  { person_id: "p7", profile_id: null, name_zh: "", name_en: "comeback chen", positions: [], workspaces: [], maybe_dup: null },
];
const INVITES = [
  { person_id: "p4", code: "bt-aaaa1111", email: "comeback@example.com", lang: "en", status: "opened",
    created_at: "2026-11-07T01:00:00+00:00", sent_at: "2026-11-07T01:01:00+00:00", opened_at: "2026-11-07T02:00:00+00:00", claimed_at: null,
    expires_at: "2026-12-07T01:00:00+00:00", revoked_at: null, mail_error: null, invited_by_name: "Paul" },
  { person_id: "p5", code: "bt-bbbb2222", email: "two@example.com", lang: "zh", status: "failed",
    created_at: "2026-11-06T01:00:00+00:00", sent_at: null, opened_at: null, claimed_at: null,
    expires_at: "2026-12-06T01:00:00+00:00", revoked_at: null, mail_error: "Resend 422", invited_by_name: "Paul" },
];

test("★ 名單合上邀請狀態：沒有帳號的紀錄多一個 invite 欄，有帳號的不動", () => {
  const m = mergeInvites(PEOPLE, INVITES);
  assert.equal(m.find(p => p.person_id === "p4").invite.status, "opened");
  assert.equal(m.find(p => p.person_id === "p5").invite.status, "failed");
  assert.equal(m.find(p => p.person_id === "p6").invite, null);
  assert.equal(m.find(p => p.person_id === "p1").invite, null, "有帳號的人不會掛邀請狀態");
  assert.equal(mergeInvites(PEOPLE, null).length, PEOPLE.length, "狀態載不到名單照畫");
});

test("狀態徽章：七種狀態各一句，帶時間；寄失敗印原因", () => {
  assert.match(inviteBadgeHTML(INVITES[0]), /class="tag open"[^>]*>開過信</);
  assert.match(inviteBadgeHTML(INVITES[0]), /2026-11-07/);
  assert.match(inviteBadgeHTML(INVITES[1]), /class="tag warn"[^>]*>寄失敗</);
  assert.match(inviteBadgeHTML(INVITES[1]), /Resend 422/);
  assert.match(inviteBadgeHTML({ status: "claimed", claimed_at: "2026-11-08T03:00:00+00:00" }), /認領了/);
  assert.match(inviteBadgeHTML({ status: "expired" }), /過期/);
  assert.match(inviteBadgeHTML({ status: "revoked" }), /撤銷/);
  assert.match(inviteBadgeHTML({ status: "sent" }), /寄出/);
  assert.match(inviteBadgeHTML({ status: "queued" }), /排隊中/);
  assert.equal(inviteBadgeHTML(null), "");
});

test("★ 名單：沒有帳號的人列上有狀態徽章、有勾選框；「沒有帳號」篩選只留他們", () => {
  const people = mergeInvites(PEOPLE, INVITES);
  const h = rosterHTML(people, TERMS, ME, true, "", false, { term: "all", team: "" }, [], null, null);
  assert.match(h, /data-act="roster-noacc"/, "有「沒有帳號」那顆 chip");
  assert.match(h, /data-act="bulk-tick" data-id="p4"/);
  assert.match(h, /data-act="bulk-tick" data-id="p6"/);
  assert.doesNotMatch(h, /data-act="bulk-tick" data-id="p1"/, "有帳號的人沒有勾選框");
  assert.match(h, /開過信/); assert.match(h, /寄失敗/);
  assert.match(h, /校友碼 bt-old-01 還沒用/, "手抄的舊碼還是印");
  const only = rosterHTML(people, TERMS, ME, true, "", false, { term: "all", team: "", noacc: true }, [], null, null);
  assert.doesNotMatch(only, /data-act="person-edit" data-id="p1"/);
  assert.equal((only.match(/data-act="bulk-tick"/g) || []).length, 4);
  assert.match(only, /data-act="roster-noacc"[^>]*class="chip on"|class="chip on" data-act="roster-noacc"/);
});

test("★ 批次面板：勾了誰就列誰，email 預填、一個語言全套、每一列可以另外選；按鈕上有人數", () => {
  const people = mergeInvites(PEOPLE, INVITES);
  const bulk = { ticked: ["p4", "p5", "p6"], lang: "zh", emails: { p6: "old@example.com" }, langs: { p5: "en" }, results: null };
  const rows = bulkRows(people, bulk);
  assert.deepEqual(rows.map(r => [r.person_id, r.email, r.lang]), [["p4", "comeback@example.com", "zh"], ["p5", "two@example.com", "en"], ["p6", "old@example.com", "zh"]]);
  const h = bulkPanelHTML(bulk, people, false);
  assert.match(h, /id="bk-email-p4"[^>]*value="comeback@example.com"/);
  assert.match(h, /id="bk-email-p6"[^>]*value="old@example.com"/);
  assert.match(h, /<select id="bk-lang"/);
  assert.match(h, /<select id="bk-lang-p5"[^>]*>[\s\S]*?<option value="en" selected>/);
  assert.match(h, /data-act="bulk-send"[^>]*>寄 3 封邀請信</);
  assert.match(h, /data-act="bulk-untick" data-id="p5"/);
  assert.match(h, /data-act="bulk-clear"/);
  assert.equal(bulkPanelHTML({ ticked: [] }, people, false), "", "沒勾人就沒有面板");
  const empty = bulkRows(people, { ticked: ["p4"], emails: { p4: "" } });
  assert.equal(empty[0].email, "", "使用者清空的那一格不會被預填蓋回去");
});

test("批次送出的資料與結果：空 email 的那一列先擋、結果分三類", () => {
  const rows = [{ person_id: "p4", email: "a@example.com", lang: "zh" }, { person_id: "p5", email: "", lang: "en" }];
  const { payload, missing } = bulkPayload(rows);
  assert.deepEqual(payload, [{ person: "p4", email: "a@example.com", lang: "zh" }]);
  assert.deepEqual(missing, ["p5"]);
  // error 那一欄是 main.js 過過 says() 的字，面板照印。
  const res = [{ person: "p4", status: "sent", code: "bt-1" }, { person: "p5", status: "existing", code: "bt-2" }, { person: "p6", status: "error", error: says(new Error("bad_email")) }];
  assert.deepEqual(bulkSummary(res), { sent: 1, existing: 1, error: 1 });
  const people = mergeInvites(PEOPLE, INVITES);
  const h = bulkPanelHTML({ ticked: ["p4", "p5", "p6"], lang: "zh", results: res }, people, false);
  assert.match(h, /寄出了/); assert.match(h, /已經有一組活著的邀請/); assert.match(h, /class="tag warn">沒寄<\/span> /); assert.ok(h.includes(says(new Error("bad_email"))), "錯誤的原因放 tag 外面（tag 會轉大寫）");
});

test("★ 改一個人（沒有帳號）：「邀請回來」取代校友碼；email 預填、語言、寄；有邀請就印狀態與重寄；發碼收在摺疊裡；刪除紀錄還在最底下", () => {
  const people = mergeInvites(PEOPLE, INVITES);
  const p4 = people.find(p => p.person_id === "p4");
  const h = personEditHTML(p4, TERMS, ME, true, "", false, null, people, null, undefined, []);
  assert.match(h, /邀請回來/);
  assert.doesNotMatch(h, /校友碼與刪除紀錄/);
  assert.match(h, /id="ib-email"[^>]*value="comeback@example.com"/);
  assert.match(h, /<select id="ib-lang"/);
  assert.match(h, /data-act="invite-back-send" data-id="p4"/);
  assert.match(h, /開過信/);
  assert.match(h, /data-act="invite-back-resend" data-code="bt-aaaa1111"/);
  assert.match(h, /data-act="invite-back-revoke" data-code="bt-aaaa1111"/, "Co-President 看得到撤銷");
  assert.match(h, /<details class="fold"[^>]*>[\s\S]*?data-act="person-code" data-id="p4"/, "發碼收在摺疊裡");
  assert.match(h, /data-act="record-delete" data-id="p4"/);
  assert.ok(h.indexOf("data-act=\"record-delete\"") > h.indexOf("data-act=\"invite-back-send\""), "刪除紀錄在邀請的下面");
  // 三件事講清楚：紀錄、帳號、邀請。
  assert.match(h, /名單上的一筆紀錄/); assert.match(h, /登入帳號/); assert.match(h, /邀請/);
  // 沒有 email 的紀錄：欄位空的，沒有狀態列。
  const p6 = people.find(p => p.person_id === "p6");
  const h6 = personEditHTML(p6, TERMS, ME, true, "", false, null, people, null, undefined, []);
  assert.match(h6, /id="ib-email"[^>]*value=""/);
  assert.doesNotMatch(h6, /data-act="invite-back-resend"/);
  assert.match(h6, /bt-old-01/, "手抄的舊碼還是看得到");
  // Senior Adviser：寄得了、重寄得了，看不到撤銷與刪除紀錄。
  const sa = personEditHTML(p4, TERMS, ME, false, "", false, null, people, null, undefined, []);
  assert.match(sa, /data-act="invite-back-send"/);
  assert.match(sa, /data-act="invite-back-resend"/);
  assert.doesNotMatch(sa, /data-act="invite-back-revoke"/);
  assert.doesNotMatch(sa, /data-act="record-delete"/);
  // 草稿留住剛填的 email 與語言。
  const d = personEditHTML(p6, TERMS, ME, true, "", false, { ib: { email: "typed@example.com", lang: "en" } }, people, null, undefined, []);
  assert.match(d, /id="ib-email"[^>]*value="typed@example.com"/);
  assert.match(d, /<select id="ib-lang"[^>]*>[\s\S]*?<option value="en" selected>/);
  // 有帳號的人沒有這一塊。
  assert.doesNotMatch(personEditHTML(people[0], TERMS, ME, true, "", false, null, people, null, "paul@example.com", []), /invite-back-send/);
});

test("inviteBackHTML 自己：認領了之後只剩狀態，沒有寄的表單", () => {
  const p = { person_id: "p9", profile_id: null, name_en: "X", invite: { status: "claimed", code: "bt-c", email: "x@example.com", claimed_at: "2026-11-08T03:00:00+00:00" } };
  const h = inviteBackHTML(p, {}, false, true);
  assert.match(h, /認領了/);
  assert.doesNotMatch(h, /data-act="invite-back-send"/);
  assert.doesNotMatch(h, /data-act="invite-back-resend"/);
});

test("★ 邀請頁：打的名字對到名單上沒有帳號的人就先問要不要掛上去", () => {
  assert.deepEqual(nameMatches(PEOPLE, "", "comeback chen").map(p => p.person_id), ["p4", "p7"], "英文名不分大小寫");
  assert.deepEqual(nameMatches(PEOPLE, "陳回來", "").map(p => p.person_id), ["p4"]);
  assert.deepEqual(nameMatches(PEOPLE, "", "Paul"), [], "有帳號的不算");
  assert.deepEqual(nameMatches(PEOPLE, "", ""), []);
  const matches = nameMatches(PEOPLE, "", "comeback chen");
  const h = inviteChooserHTML(matches, "", false);
  assert.match(h, /掛到名單上已經有的紀錄/);
  assert.match(h, /name="in-attach" value="p4"/);
  assert.match(h, /name="in-attach" value="p7"/);
  assert.match(h, /name="in-attach" value="__new"/);
  assert.match(h, /Associate, Marketing Team/, "列出那一筆的職位好認人");
  assert.match(inviteChooserHTML(matches, "p7", false), /value="p7" checked/);
  assert.equal(inviteChooserHTML([], "", false), "");
  const form = inviteFormNewHTML({ name_en: "comeback chen" }, TERMS, false, PEOPLE);
  assert.match(form, /name="in-attach"/);
  const page = invitesPageHTML([], [], TERMS, "", false, { name_en: "comeback chen" }, null, true, false, PEOPLE);
  assert.match(page, /name="in-attach"/);
  // 資料庫自己撞到同名好幾筆：訊息裡的 id 拆得出來，畫面拿去畫同一個選擇器。
  assert.deepEqual(ambiguousIds(new Error("ambiguous_person:p4,p7")), ["p4", "p7"]);
  assert.deepEqual(ambiguousIds(new Error("bad_email")), []);
  assert.match(says(new Error("ambiguous_person:p4,p7")), /同名/);
});

test("變動紀錄：invite_back 與 invite 兩種 field 都有中文標籤", () => {
  const ch = [
    { id: 9, changed_by: ME, target: null, target_name: "陳回來", field: "invite_back", old_value: "comeback@example.com", new_value: "bt-aaaa1111", created_at: "2026-11-07T01:00:00+00:00" },
    { id: 8, changed_by: ME, target: null, target_name: "批次邀請 3 位", field: "invite_back", old_value: "bulk", new_value: "2", created_at: "2026-11-07T01:00:00+00:00" },
    { id: 7, changed_by: ME, target: null, target_name: "x@example.com", field: "invite", old_value: null, new_value: "bt-x", created_at: "2026-11-07T01:00:00+00:00" },
  ];
  const h = changesHTML(ch, PEOPLE, "");
  assert.match(h, /請回來/);
  assert.match(h, /邀請信/);
  assert.doesNotMatch(h, />invite_back</);
  assert.doesNotMatch(h, />invite</);
});

test("錯誤訊息：三件事分開講", () => {
  assert.match(says(new Error("person_has_account")), /已經有登入帳號/, "person_has_account 要排在 has_account 前面才輪得到");
  assert.match(says(new Error("email_has_account")), /email/);
  assert.match(says(new Error("has_unused_invite")), /撤銷/);
  assert.match(says(new Error("invite_pending")), /活著|還沒過期|還在/);
});

test("★ 校友的歡迎卡：故事沒填或沒勾同意就出現，關掉過就不出現，幹部與學員沒有", () => {
  const me = { role: "alumni", email: "a@example.com", name_zh: "陳回來", alumni_welcome_dismissed_at: null };
  assert.equal(showWelcome(me, null), true);
  assert.equal(showWelcome(me, { quote: "x", public_story: false }), true);
  assert.equal(showWelcome(me, { quote: "x", public_story: true }), false);
  assert.equal(showWelcome({ ...me, alumni_welcome_dismissed_at: "2026-11-07T00:00:00Z" }, null), false);
  assert.equal(showWelcome({ ...me, role: "cadre" }, null), false);
  assert.equal(showWelcome({ ...me, role: "student" }, null), false);
  const h = welcomeHTML(me, null);
  assert.match(h, /class="welcome"/);
  assert.match(h, /歡迎回來/);
  assert.match(h, /\.\.\/alumni\//); assert.match(h, /\.\.\/events\//);
  assert.match(h, /data-act="welcome-dismiss"/);
  assert.match(h, /三件事|三個/);
  const page = settingsHTML(me, "", false, null);
  assert.ok(page.indexOf('class="welcome"') > -1 && page.indexOf('class="welcome"') < page.indexOf('id="nzh"'), "卡在最上面");
  assert.doesNotMatch(settingsHTML({ ...me, role: "cadre" }, "", false, null), /class="welcome"/);
  settingsLang("en");
  assert.match(welcomeHTML(me, null), /Welcome back/);
  settingsLang("zh");
});

test("變動都要有英文版：新加的字典鍵中英都有", () => {
  const src = readFileSync(new URL("../admin/people/src/strings.js", import.meta.url), "utf8");
  for (const k of ["ib.title", "ib.send", "ib.email", "ib.lang", "bk.title", "bk.send", "bk.mailNotSent", "in.attach", "ro.noAccountChip", "field.invite_back"]) {
    assert.match(src, new RegExp(`"${k.replace(".", "\\.")}":\\s*\\{ zh: ".+", en: ".+" \\}`), k);
  }
  const s2 = readFileSync(new URL("../settings/src/strings.js", import.meta.url), "utf8");
  for (const k of ["w.title", "w.dismiss", "w.story", "w.events", "w.contact"]) {
    assert.match(s2, new RegExp(`"${k.replace(".", "\\.")}":\\s*\\{ zh: ".+", en: ".+" \\}`), k);
  }
});
