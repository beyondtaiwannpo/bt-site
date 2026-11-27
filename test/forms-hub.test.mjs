// 「所有表單」（/admin/team-forms/#all，2026-11-27 Paul：「they should be able to know like what's going on and like what form is for what」）。
// 三種表單（報名表、回饋表、內部表單）一張清單，每一份標是哪一種、哪一場活動的、開著沒、收了幾份；下面「建一份」。
// 誰看得到哪一份是資料庫 my_forms() 用原本三套門過濾的（supabase/migrations/2027-01-23-website-and-forms.sql），這裡只守畫面與連結。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as UI from "../admin/team-forms/src/ui.js";

UI.setLang("zh");

const EV = { id: "e1", slug: "camp", title_zh: "冬令營", title_en: "Winter Camp", status: "published" };
const ALL = {
  signup: [{ id: "s1", title: "冬令營報名", status: "open", updated_at: "2026-11-20", event: EV, total: 12, received: 3, can_edit: true },
           { id: "s2", title: "<b>x</b>", status: "draft", updated_at: "2026-11-01", event: { ...EV, status: "draft" }, total: 0, received: 0, can_edit: false }],
  feedback: [{ id: "f1", title: "冬令營回饋", status: "open", updated_at: "2026-11-25", event: EV, responses: 7, can_edit: true }],
  internal: [{ id: "i1", title: "季回饋", status: "closed", updated_at: "2026-11-10", responses: 20, recipients: 30, can_edit: true }],
  events: [{ id: "e1", slug: "camp", title_zh: "冬令營", title_en: "Winter Camp", has_form: true }, { id: "e2", slug: "gala", title_zh: "年會", title_en: "Gala", has_form: false }],
  can_create_internal: false,
};

test("三種表單排成一張清單，最近改過的在最上面", () => {
  assert.deepEqual(UI.allRows(ALL).map(r => [r.kind, r.id]), [["feedback", "f1"], ["signup", "s1"], ["internal", "i1"], ["signup", "s2"]]);
  assert.deepEqual(UI.allRows(null), []);
  assert.deepEqual(UI.ALL_KINDS, ["signup", "feedback", "internal"]);
});

test("每一份點下去回它原本那一頁：報名表到後台、回饋表到紀錄、內部表單是這一頁的 #build", () => {
  assert.equal(UI.allHref({ kind: "signup", id: "s 1" }), "/admin/?lang=zh#forms/s%201");
  assert.equal(UI.allHref({ kind: "feedback", id: "f1" }), "/admin/records/?lang=zh#forms/f1");
  assert.equal(UI.allHref({ kind: "internal", id: "i1" }), "#build/i1");
});

test("清單：標種類、哪一場活動、份數；活動還沒上架的報名表說還沒公開；改不動的標只能看；標題跳脫", () => {
  const h = UI.allFormsHTML(ALL, "", false, {});
  assert.match(h, /<span class="tag kind k-signup">報名表<\/span><a href="\/admin\/\?lang=zh#forms\/s1"><b>冬令營報名<\/b><\/a>/);
  assert.match(h, /冬令營的・收到 12 份，3 份還沒審/);
  assert.match(h, /<span class="tag kind k-feedback">回饋表<\/span>[\s\S]*?收到 7 份/);
  assert.match(h, /<span class="tag kind k-internal">內部表單<\/span><a href="#build\/i1" data-act="open-form" data-id="i1">[\s\S]*?20 \/ 30 人填了/);
  assert.match(h, /活動還沒上架，表單還沒公開/);
  assert.match(h, /&lt;b&gt;x&lt;\/b&gt;[\s\S]*?只能看/);
  assert.ok(!h.includes("<b>x</b>"));
  // 篩一種：只剩那一種，那一顆亮著。
  const f = UI.allFormsHTML(ALL, "", false, { filter: "feedback" });
  assert.match(f, /class="chip on" data-act="all-filter" data-k="feedback" aria-pressed="true"/);
  assert.doesNotMatch(f, /冬令營報名/);
  // 還沒載入：骨架；沒有任何一份：說怎麼建。
  assert.doesNotMatch(UI.allFormsHTML(null, "", false, {}), /all-new/);
  assert.match(UI.allFormsHTML({ signup: [], feedback: [], internal: [], events: [] }, "", false, {}), /你還沒有管任何一份表單/);
});

test("建一份：三張卡說每一種是做什麼的；報名表與回饋表選一場活動；內部表單要被派進「誰能建」", () => {
  const n = UI.newFormHTML(ALL, {}, false);
  for (const k of UI.ALL_KINDS) assert.match(n, new RegExp(`data-act="all-kind" data-k="${k}"`));
  assert.match(n, /活動上架之後，掛在上面的報名表才會公開/);
  assert.doesNotMatch(n, /id="all-ev"/, "還沒選種類不畫活動");
  const s = UI.newFormHTML(ALL, { kind: "signup" }, false);
  assert.match(s, /<option value="e1">冬令營 （已經有報名表，會打開它）<\/option><option value="e2">年會<\/option>/);
  assert.match(s, /data-act="all-make">建報名表/);
  assert.doesNotMatch(UI.newFormHTML(ALL, { kind: "feedback" }, false), /已經有報名表/, "回饋表一場可以好幾份，不標");
  assert.match(UI.newFormHTML({ ...ALL, events: [] }, { kind: "signup" }, false), /你現在沒有改得動的活動/);
  assert.match(UI.newFormHTML(ALL, { kind: "internal" }, false), /內部表單（誰能建）/);
  assert.match(UI.newFormHTML({ ...ALL, can_create_internal: true }, { kind: "internal" }, false), /href="#build" data-act="all-internal">建一份內部表單/);
  assert.match(UI.newFormHTML(ALL, { kind: "signup" }, true), /disabled>建立中/);
});

test("建的時候走原本那兩支（attach_event_form、rc_save_form），資料庫自己擋；my_forms 不回答案", () => {
  const d = readFileSync("admin/team-forms/src/data.js", "utf8");
  assert.match(d, /rpc\("my_forms"\)/);
  assert.match(d, /rpc\("attach_event_form", \{ p_event: eventId \}\)/);
  assert.match(d, /rpc\("rc_save_form", \{ p_form: null, p_data: \{ title, kind: "post-event", event_id: eventId, lang: lang\(\) \}, p_questions: \[\] \}\)/);
  const sql = readFileSync("supabase/migrations/2027-01-23-website-and-forms.sql", "utf8");
  for (const g of ["form_can_view(f.id)", "rc_form_reader(f.id)", "tf_is_reader(f.id)", "can_edit(e.workspace_id)", "raise exception 'not_cadre'"]) assert.ok(sql.includes(g), g);
  assert.match(sql, /revoke all on function public\.my_forms\(\) from public, anon;/);
  assert.doesNotMatch(sql.slice(sql.indexOf("create or replace function public.my_forms"), sql.indexOf("revoke all on function public.my_forms")), /answers|email/);
  assert.doesNotMatch(sql, /create policy|drop policy|alter table/i, "沒有動任何一張表的 RLS");
});
