// 後台右下角一顆「回報問題、許願功能」與它的收件匣（2026-11-25）。跑法：node --test test/*.test.mjs
// Paul 2026-11-25：「I need you to build a requesting button on the page, team members can submit bug, features they want through text and pictures
//   and it goes to me like a little folating icon is enough」。他選的：後台一頁收件匣加一封信、Co-President 與 Senior Adviser 讀得到、只有幹部看得到那一顆。
// 這一支守畫面與遷移檔的字；資料庫真的跑一次（誰放得進圖、誰讀得到、信寄給誰）在 scripts/db/smoke.sh 最後那一段。資料全是假的。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as RAIL from "../shared/rail.js";
import * as PE from "../admin/people/src/ui.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const PRES = { role: "cadre", board: "president", name: "P", ws: {} };
const DIRECTOR = { role: "cadre", board: "director", name: "D", ws: {} };

test("★ 那一顆與格子：三種、打字、最多四張圖、送出；中英文都有，沒有任何一格是送給別的地方的", () => {
  const en = RAIL.feedbackHTML("en"), zh = RAIL.feedbackHTML("zh");
  assert.match(en, /<button type="button" class="fb-fab" data-fb="open" aria-haspopup="dialog" aria-label="Report a bug or ask for a feature"/);
  assert.match(en, /<dialog class="fb-dlg" aria-labelledby="fb-h">/);
  assert.match(en, /This goes to the Co-Presidents and Senior Advisers\. Only they can read it\./, "格子上寫清楚誰看得到");
  for (const k of ["bug", "feature", "other"]) assert.match(en, new RegExp(`<input type="radio" name="fb-kind" value="${k}"`), k);
  assert.match(en, /name="fb-kind" value="bug" checked/, "預設是「有東西壞了」");
  assert.match(en, /<textarea id="fb-body" class="fb-body" rows="5" maxlength="4000"/);
  assert.match(en, /<input type="file" data-fb="files" accept="image\/jpeg,image\/png,image\/webp" multiple hidden>/);
  assert.match(en, /Up to four\. You can also paste a screenshot/); assert.equal(RAIL.FB_MAX, 4);
  assert.match(en, /data-fb="close">Cancel</); assert.match(en, /data-fb="send">Send</);
  assert.match(zh, /回報問題、許願功能/); assert.match(zh, /送給 Co-President 與 Senior Adviser。只有他們看得到。/); assert.match(zh, /有東西壞了/); assert.match(zh, /想要一個功能/);
  assert.doesNotMatch(en + zh, /<form|action=|href=/, "格子裡沒有表單送出、沒有連結，只走 send_feedback");
});

test("★ 圖的檔名是資料庫收的那個格式（自己的 id／13 位數時間加六個字），副檔名跟著型別", () => {
  const ok = /^[0-9a-f-]{36}\/[0-9]{13}-[a-z0-9]{6}\.(jpg|png|webp)$/, uid = "7e54cf4a-5a94-4bcb-a140-5b1c4f360c50";
  assert.equal(RAIL.feedbackPath(uid, "image/jpeg", 1795661014499, "ab12cd"), `${uid}/1795661014499-ab12cd.jpg`);
  assert.match(RAIL.feedbackPath(uid, "image/png", 1795661014499, "x"), ok, "亂數太短會補滿六個字");
  assert.match(RAIL.feedbackPath(uid, "image/webp", 42, "ABC.def-ghi"), ok, "時間補到 13 位，亂數裡不是小寫英數的拿掉");
  assert.match(RAIL.feedbackPath(uid, "", 1795661014499, ""), /\.jpg$/);
  // 同一條規則資料庫寫了兩次（放圖的政策、送出的函式），兩邊的字要一樣
  const sql = read("supabase/migrations/2027-01-10-site-feedback.sql");
  assert.equal((sql.match(/v_uid::text \|\| '\/\[0-9\]\{13\}-\[a-z0-9\]\{6\}\\\.\(jpg\|png\|webp\)\$'/g) || []).length, 2);
});

test("資料庫回的錯變成一句話；函式或 bucket 不在的時候說要跑哪一支", () => {
  const s = m => RAIL.feedbackSays(new Error(m), "en");
  assert.match(s("too_many_today"), /sent a lot today/); assert.match(s("not_cadre"), /Only cadres/);
  assert.match(s("bad_photo"), /would not upload/); assert.match(s("new row violates row-level security policy"), /would not upload/);
  assert.match(s("Could not find the function public.send_feedback(p) in the schema cache"), /2027-01-10-site-feedback\.sql/);
  assert.match(s("Bucket not found"), /2027-01-10-site-feedback\.sql/);
  assert.match(s("network down"), /Could not send: network down/);
  assert.match(RAIL.feedbackSays(new Error("too_many_today"), "zh"), /明天再送/);
});

test("★ 那一顆只給幹部、掛在 body 上；側欄的 HTML 裡沒有它（重畫不會洗掉打到一半的字）", () => {
  const src = read("shared/rail.js");
  // 2026-11-26 同一行多掛一顆「怎麼用」導覽（test/tour.test.mjs），條件沒變。
  assert.match(src, /if \(typeof document !== "undefined" && me && me\.role === "cadre"\) \{ mountFeedback\(L\);/);
  assert.match(src, /document\.body\.appendChild\(h\)/);
  assert.doesNotMatch(RAIL.railHTML("forms", "events", DIRECTOR, {}, "en"), /fb-fab|fb-dlg/);
  assert.doesNotMatch(RAIL.shellHTML("", "", ""), /fb-fab/);
  assert.match(src, /const \{ supabase \} = await import\("\.\/supabase\.js"\);/, "用到的時候才載，跟每一頁是同一個 client");
  assert.doesNotMatch(src, /^import /m, "rail.js 最上面還是沒有 import（測試在 Node 裡載得動）");
  assert.match(src, /supabase\.storage\.from\("feedback"\)\.upload\(path, blob, \{ contentType: blob\.type, upsert: false \}\)/);
  assert.match(src, /supabase\.rpc\("send_feedback", \{ p: \{ kind, body, page: \(location\.pathname \+ location\.hash\)\.slice\(0, 300\), photos \} \}\)/);
  const css = read("shared/rail.css");
  for (const c of [".fb-fab{position:fixed;right:20px;bottom:20px", ".fb-dlg{", ".fb-dlg::backdrop{", ".fb-pic{", "@media print{.fb-fab{display:none}}"]) assert.ok(css.includes(c), c);
});

test("★ 收件匣那一頁只在 Co-President 與 Senior Adviser 的選單上", () => {
  const it = RAIL.ITEMS.find(i => i.group === "people" && i.key === "feedback");
  assert.ok(it); assert.equal(it.who, "senior"); assert.equal(it.area, "people");
  assert.ok(RAIL.canSee(it, PRES)); assert.ok(!RAIL.canSee(it, DIRECTOR)); assert.ok(!RAIL.canSee(it, { role: "student" }));
  assert.match(RAIL.railHTML("people", "feedback", PRES, { feedback: 3 }, "en"), /Bugs &amp; requests<span class="rail-count">3<\/span>/, "還沒處理的有幾則印在選單上");
});

test("★ 收件匣：一則一列（誰、哪一種、字、當時在哪、縮圖、處理到哪、備註）；他寫的字與那一頁都跳脫過", () => {
  PE.setLang("en");
  const list = [
    { id: "f1", kind: "bug", body: "Save does <b>nothing</b>\nline two", page: "/admin/#events", photos: ["u1/1795661014499-ab12cd.jpg", "u1/1795661014499-zzzzzz.jpg"], status: "new", note: "", created_at: "2026-11-25T10:00:00Z", author_name: "Ann Lee", author_team: "Marketing Team" },
    { id: "f2", kind: "feature", body: "Dark mode", page: "javascript:alert(1)", photos: [], status: "done", note: "shipped", created_at: "2026-11-24T10:00:00Z", handled_at: "2026-11-25T12:00:00Z", handled_by_name: "Pat", author_name: "", author_team: "" },
  ];
  const urls = { "u1/1795661014499-ab12cd.jpg": "https://x.supabase.co/storage/v1/object/sign/feedback/u1/a.jpg?token=t" };
  const h = PE.feedbackPageHTML(list, urls, "", false, { st: "new" }, {});
  assert.match(h, /<h1>Bugs & requests<\/h1>/);
  assert.match(h, /data-act="fb-st" data-v="new" aria-pressed="true">New 1</); assert.match(h, /data-v="done" aria-pressed="false">Done 1</); assert.match(h, /data-v="all" aria-pressed="false">All 2</);
  assert.match(h, /<span class="tag warn">Bug<\/span> <b>Ann Lee<\/b> <span class="mini">Marketing Team<\/span>/);
  assert.match(h, /Save does &lt;b&gt;nothing&lt;\/b&gt;\nline two/, "他寫的字不會變成 HTML");
  assert.match(h, /on <a href="\/admin\/#events">\/admin\/#events<\/a>/);
  assert.match(h, /<a class="fb-thumb" href="https:\/\/x\.supabase\.co[^"]*" target="_blank" rel="noopener"><img/); assert.match(h, /<span class="fb-thumb none">Picture not available<\/span>/, "換不到連結的那一張不畫圖");
  assert.match(h, /<select data-act="fb-set" data-id="f1"[^>]*><option value="new" selected>New<\/option><option value="doing">In progress<\/option><option value="done">Done<\/option><option value="closed">Not doing<\/option><\/select>/);
  assert.match(h, /<input data-fb-note="f1" value="" maxlength="2000"/); assert.match(h, /data-act="fb-note-save" data-id="f1"/);
  assert.doesNotMatch(h, /Dark mode/, "看的是「新的」，做好的不在這一頁");
  const all = PE.feedbackPageHTML(list, urls, "", false, { st: "all" }, { f2: "typed but not saved" });
  assert.match(all, /Dark mode/); assert.match(all, /\(person removed\)/, "送的人不在了也印得出來");
  assert.match(all, /on javascript:alert\(1\)/); assert.doesNotMatch(all, /href="javascript:/, "不是站內路徑的不給連結");
  assert.match(all, /<input data-fb-note="f2" value="typed but not saved"/, "打到一半的備註重畫之後還在");
  assert.match(all, /Marked by Pat on /);
  assert.match(PE.feedbackPageHTML([], {}, "", false, null, null), /Nothing has been sent yet/);
  assert.match(PE.feedbackPageHTML(list, urls, "", false, { st: "closed" }, {}), /Nothing with this status/);
  assert.deepEqual(PE.fbCounts(list), { new: 1, doing: 0, done: 1, closed: 0, all: 2 });
});

test("★ 遷移檔：表不發權限、讀與標只有 senior、圖的 bucket 是私人的、信只寄給 Co-President 與 Senior Adviser、沒有重寫寄信那幾支", () => {
  const sql = read("supabase/migrations/2027-01-10-site-feedback.sql").replace(/--[^\n]*/g, "");
  assert.match(sql, /alter table public\.site_feedback enable row level security;\s*revoke all on public\.site_feedback from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy [a-z_]+ on public\.site_feedback/, "表上沒有任何政策，全部走函式");
  assert.match(sql, /values \('feedback', 'feedback', false, 5242880, array\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/);
  assert.match(sql, /if v_uid is null or not public\.is_cadre\(\) then raise exception 'not_cadre'/);
  assert.equal((sql.match(/perform public\.require_senior\(\);/g) || []).length, 2, "讀全部、標狀態各一句");
  assert.match(sql, /pr\.role = 'cadre' and pr\.board_role in \('president', 'senior_adviser'\) and pr\.id <> v_uid/);
  assert.match(sql, /unnest\(v_kinds \|\| array\['feedback_new'\]\)/, "信的種類是讀現在的清單再加一個");
  assert.doesNotMatch(sql, /create or replace function public\.(send_pending_mail|mail_render|mail_button_url|mail_html|mail_tail)\b/, "寄信那幾支一支都沒重寫");
  assert.doesNotMatch(sql, /feedback_(update|delete) on storage\.objects for/, "圖沒有改與刪的政策");
  assert.match(sql, /revoke all on function public\.send_feedback\(jsonb\), public\.feedback_inbox\(\), public\.feedback_set\(uuid, text, text\), public\.feedback_count\(\) from public, anon;/);
  assert.ok(read("scripts/db/smoke.sh").includes("2027-01-10-site-feedback.sql"), "smoke.sh 的清單是寫死的，要自己加");
  const m = read("admin/people/src/main.js");
  assert.match(m, /if \(key === "feedback"\) return openFeedback\(\);/); assert.match(m, /UI\.railHTML\("people", tab, S\.me, \{ feedback: S\.fbNew \}\)/);
  const d = read("admin/people/src/data.js");
  assert.match(d, /supabase\.storage\.from\("feedback"\)\.createSignedUrls\(list, 3600\)/, "圖是一小時有效的連結，不是公開網址");
});
