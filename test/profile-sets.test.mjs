// 個人連結的故事題（2027-01-26，遷移檔 2027-01-26-profile-question-sets.sql）：一套題目怎麼進 /profile/ 第 4 步、
// 怎麼存回 story（鍵是題目代號）、後台那個人的頁面怎麼把答案對回當時的題目。資料全是假的。
// 資料庫那一半（誰建得了、回饋表那兩條路擋不擋、照標籤挑、只換這一套的鍵）在 scripts/db/smoke.sh 的 2027-01-26 那一段。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as P from "../profile/src/ui.js";
import * as R from "../admin/records/src/ui.js";

const Q1 = "aaaaaaaa-0000-4000-8000-000000000001", Q2 = "aaaaaaaa-0000-4000-8000-000000000002", Q3 = "aaaaaaaa-0000-4000-8000-000000000003", Q4 = "aaaaaaaa-0000-4000-8000-000000000004";
const SET = {
  id: "bbbbbbbb-0000-4000-8000-000000000001", title: "講者（假）", intro: "謝謝你來分享（假的開頭）。", lang: "zh",
  questions: [
    { id: Q1, ord: 1, key: "talk_topic", type: "short", label: "你講了什麼？", required: true, options: [], config: {}, logic: [] },
    { id: Q2, ord: 2, key: "share_how", type: "multi", label: "你願意怎麼幫？", required: false, options: ["再來講一次", "當 mentor", "介紹別人"], config: {},
      logic: [{ match: "all", when: [{ q: Q2, op: "has", v: "當 mentor" }], do: "show", target: Q3 }] },
    { id: Q3, ord: 3, key: "", type: "long", label: "想帶哪一種學生？", required: false, options: [], config: {}, logic: [] },
    { id: Q4, ord: 4, key: "", type: "heading", label: "最後一段", required: false, options: [], config: {}, logic: [] },
  ],
};
const SERVER = {
  person: { name_zh: "測試講者", name_en: "Test Speaker", school: "" },
  profile: { story: { talk_topic: "假的講題", share_how: "再來講一次\n當 mentor", [Q3]: "假的回答", turning: "以前那一套的答案" } },
  contacts: {}, education: [], career: [], events: [], set: SET,
};

test("★ 一套題目載進來：答案照代號倒回去，沒有代號用題目 id，多選倒回陣列；排版區塊不收答案", () => {
  const s = P.fromServer(SERVER);
  assert.equal(s.set.id, SET.id);
  assert.equal(s.answers[Q1], "假的講題");
  assert.deepEqual(s.answers[Q2], ["再來講一次", "當 mentor"]);
  assert.equal(s.answers[Q3], "假的回答");
  assert.ok(!(Q4 in s.answers));
  assert.deepEqual(P.setInputs(s).map(q => q.id), [Q1, Q2, Q3]);
  assert.equal(P.storyKey(SET.questions[0]), "talk_topic");
  assert.equal(P.storyKey(SET.questions[2]), Q3);
});

test("★ 送出去的 story 只有這一套的鍵：多選用換行接，藏起來的那一題送空字串（就是拿掉）", () => {
  const s = P.fromServer(SERVER);
  assert.deepEqual(P.toPayload(s).story, { talk_topic: "假的講題", share_how: "再來講一次\n當 mentor", [Q3]: "假的回答" });
  // 取消勾「當 mentor」，第三題被條件藏起來
  s.answers[Q2] = ["再來講一次"];
  assert.deepEqual(P.toPayload(s).story, { talk_topic: "假的講題", share_how: "再來講一次", [Q3]: "" });
});

test("沒有一套題目的連結照舊是內建的六題", () => {
  const s = P.fromServer(Object.assign({}, SERVER, { set: null }));
  assert.equal(s.set, null);
  assert.ok("turning" in P.toPayload(s).story);
  assert.deepEqual(P.storyCount(s).of, 6);
});

test("必填的那一題沒寫：錯在第 4 步，路徑是 ans.題目 id", () => {
  const s = P.fromServer(SERVER);
  s.answers[Q1] = "";
  const v = P.validate(s, 4, false);
  assert.equal(v.ok, false); assert.equal(v.step, 4);
  assert.match(v.errors["ans." + Q1], /^fx:/);
  assert.equal(P.stepOf("ans." + Q1), 4);
  assert.equal(P.validate(Object.assign(s, { answers: Object.assign({}, s.answers, { [Q1]: "有寫" }) }), 4, false).ok, true);
});

test("寫了幾題：藏起來的不算", () => {
  const s = P.fromServer(SERVER);
  assert.deepEqual(P.storyCount(s), { of: 3, n: 3 });
  s.answers[Q2] = []; s.answers[Q1] = "";
  assert.deepEqual(P.storyCount(s), { of: 2, n: 0 });
});

test("第 4 步畫的是這一套：開頭那一段話、引擎的格子、這一套的語言", () => {
  const s = P.fromServer(SERVER);
  const html = P.formHTML(s, { step: 4, en: true, meta: {} });
  assert.ok(html.includes("謝謝你來分享（假的開頭）。"));
  assert.ok(html.includes(`data-fx="${Q1}"`) && html.includes(`data-fx="${Q2}"`));
  assert.ok(html.includes('lang="zh-Hant"'));
  assert.ok(!html.includes('name="story.turning"'), "內建六題不畫");
});

test("草稿：存答案不存題目（題目每次從資料庫拿），載回來只收字串與字串陣列", () => {
  const mem = new Map(), store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const s = P.fromServer(SERVER);
  P.draftSave(TOKEN, s, 4, P.fromServer(SERVER), store);
  const raw = [...mem.values()].join("");
  if (raw) {
    assert.ok(!raw.includes("你講了什麼？"), "題目不進草稿");
    const back = P.draftLoad(TOKEN, P.fromServer(SERVER), store);
    if (back && back.state) assert.ok(!back.state.set || back.state.set.id === SET.id);
  }
});

test("★ 後台他的故事：內建的題目照舊，套裡的答案對回當時那一句與那一套的名稱", () => {
  const rows = R.storyRows({
    story: { turning: "內建題的答案", talk_topic: "假的講題", where_now: "假的現況" },
    story_q: { talk_topic: { label: "當時問的：你講了什麼？", type: "short", ord: 1, set: "講者" }, where_now: { label: "你現在在哪？", type: "short", ord: 1, set: "以前的 mentee" } },
  });
  const turning = rows.find(r => r.key === "turning");
  assert.equal(turning.answer, "內建題的答案");
  assert.deepEqual(rows.filter(r => r.set).map(r => [r.key, r.label, r.set]).sort(), [["talk_topic", "當時問的：你講了什麼？", "講者"], ["where_now", "你現在在哪？", "以前的 mentee"]]);
  // 只用過一套、內建題一題都沒寫：不畫內建那六題的空格
  assert.deepEqual(R.storyRows({ story: { talk_topic: "x" }, story_q: { talk_topic: { label: "L", set: "S" } } }).map(r => r.key), ["talk_topic"]);
});

test("後台：故事題只有管紀錄的人選得到這一種；不收換頁；設定分頁只有名稱、開頭、語言、給哪些人", () => {
  const list = R.formsListHTML({ can_manage: false, forms: [], events: [{ id: "e", title: "活動" }] }, "", false, { title: "" });
  assert.ok(!list.includes('value="profile"'));
  assert.ok(R.formsListHTML({ can_manage: true, forms: [], events: [] }, "", false, { title: "" }).includes('value="profile"'));
  const f = { id: "f", kind: "profile", title: "講者", intro: "", lang: "zh", status: "open", for_labels: ["speaker"] };
  const html = R.formEditHTML({ form: f, can_edit: true, questions: [] }, { sub: "settings", boot: { can_manage: true }, msg: "" });
  assert.ok(html.includes('name="for_label" value="speaker" checked'));
  assert.ok(!html.includes('name="event_id"') && !html.includes('name="anonymous"') && !html.includes('name="closes_at"'));
  assert.ok(!R.formHeadHTML({ form: f, can_edit: true }, "questions").includes("rc-link"), "沒有自己的填寫連結");
  assert.deepEqual(R.SET_LABELS.slice().sort(), ["admission_officer", "connection", "intern", "member", "mentee", "mentor", "organizer", "professor", "speaker", "student", "volunteer"]);
});

test("後台他的個人連結：挑哪一套那一格（照標籤、內建、開放中的那幾套），現在那一條用哪一套", () => {
  const S = { busy: false, boot: { forms: [{ id: "s1", kind: "profile", status: "open", title: "講者" }, { id: "s2", kind: "profile", status: "draft", title: "草稿" }, { id: "s3", kind: "post-event", status: "open", title: "回饋" }] } };
  const live = { token: "t", created_at: "2026-11-01T00:00:00Z", expires_at: "2099-01-01T00:00:00Z", form_id: "s1", form_title: "講者" };
  const html = R.personLinkHTML({ person: { id: "p", grad_year: 2015 }, link: live }, S, true);
  assert.ok(html.includes('id="rc-linkset"'));
  assert.ok(html.includes('<option value="s1" selected>講者</option>'));
  assert.ok(!html.includes('value="s2"') && !html.includes('value="s3"'));
  assert.ok(html.includes('data-act="link-set"'));
  const none = R.personLinkHTML({ person: { id: "p", grad_year: 2015 }, link: null }, S, true);
  assert.ok(none.includes('<option value="" selected>') && none.includes('data-act="link-create"') && !none.includes('data-act="link-set"'));
});

test("遷移檔的形狀：一個交易、沒有新的 RLS 政策、內部函式不給前端叫、三套起手題用固定 id", () => {
  const sql = readFileSync(new URL("../supabase/migrations/2027-01-26-profile-question-sets.sql", import.meta.url), "utf8");
  assert.match(sql, /^begin;$/m); assert.match(sql, /^commit;$/m);
  assert.ok(!/create policy|alter policy|drop policy/i.test(sql));
  for (const fn of ["rc_profile_set_for(uuid)", "rc_profile_set_json(uuid)"]) assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated`), fn);
  for (const n of [1, 2, 3]) assert.ok(sql.includes(`b7a1c0de-0000-4000-8000-00000000000${n}`));
  assert.ok(sql.includes("on conflict do nothing"));
  assert.ok(/kind = 'profile'/.test(sql) && sql.includes("set_not_open"));
});
