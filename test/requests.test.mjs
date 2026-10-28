// 行銷需求單（2026-10-31，docs/2026-10-24-行銷需求單.md）。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as SITE from "../admin/site/src/ui.js";
import * as PA from "../admin/passports/src/ui.js";
import * as PE from "../admin/people/src/ui.js";

F.setLang("zh"); SITE.setLang("zh");
const ME = { id: "u2", role: "cadre", board: "member", team: "Curriculum Team", name: "小安", senior: false, pres: false, ws: {} };
const MKT = { ...ME, id: "u5", name: "行銷", ws: { "custom:marketing-requests": "edit" } };
const VIEWER = { ...ME, id: "u6", ws: { "custom:marketing-requests": "view" } };
const PEOPLE = [{ id: "u2", name_zh: "小安", name_en: "Ann", board_role: "member" }, { id: "u5", name_zh: "行銷", name_en: "", board_role: "director" }];
const R = [
  { id: "11111111-1111-4111-8111-111111111111", kind: "poster", title: "冬令營海報", purpose: "2027 冬令營", needed_by: "2026-12-01", brief: "A2 直式\n要 QR code", asset_links: ["https://drive.google.com/x"], contact: "LINE: ann", requester: "u2", status: "new", reply: "", created_at: "2026-10-24T03:00:00Z" },
  { id: "22222222-2222-4222-8222-222222222222", kind: "post", title: "IG 貼文", purpose: "", needed_by: null, brief: "", asset_links: [], contact: "", requester: "u2", status: "done", reply: "做好了", created_at: "2026-10-20T03:00:00Z" },
  { id: "33333333-3333-4333-8333-333333333333", kind: "video", title: "回顧影片", purpose: "", needed_by: "2026-11-30", brief: "", asset_links: [], contact: "", requester: "u9", status: "in_progress", reply: "", created_at: "2026-10-22T03:00:00Z" },
  { id: "44444444-4444-4444-8444-444444444444", kind: "other", title: "收回的", purpose: "", needed_by: null, brief: "", asset_links: [], contact: "", requester: "u2", status: "withdrawn", reply: "", created_at: "2026-10-21T03:00:00Z" },
];

test("★ 側欄：每一位幹部有「跟 Marketing 提需求」；佇列只給需求工作區裡的人與靠職級的兩級；四份 ITEMS 一樣", () => {
  for (const M of [F, SITE, PA, PE]) {
    const req = M.ITEMS.find(i => i.key === "request"), queue = M.ITEMS.find(i => i.key === "requests");
    assert.equal(req.who, "cadre"); assert.equal(queue.who, "ws:custom:marketing-requests");
    assert.ok(M.canSee(req, ME)); assert.ok(!M.canSee(queue, ME), "沒被派的幹部看不到佇列");
    assert.ok(M.canSee(queue, VIEWER)); assert.ok(M.canSee(queue, { ...ME, board: "senior_adviser" }));
    assert.equal(M.wsCellHref({ id: "custom:marketing-requests", kind: "custom" }), "/admin/#requests", "Workspaces 那一格連到佇列");
    assert.equal(M.wsTeamOf({ id: "custom:marketing-requests", kind: "custom", team: "Marketing Team" }, []), "Marketing Team", "落在 Marketing 那一列");
  }
});

test("送單的頁：表單七格、我送過的照狀態標、只有「新的」有收回、收回的淡掉、Marketing 的回覆印出來", () => {
  const h = F.requestPageHTML(ME, F.rqMine(R, ME), null, "", false);
  for (const id of ["rq-kind", "rq-needed", "rq-title", "rq-purpose", "rq-brief", "rq-links", "rq-contact"]) assert.match(h, new RegExp(`id="${id}"`));
  assert.match(h, /data-act="rq-submit"/);
  assert.equal(F.rqMine(R, ME).length, 3, "u9 的那一張不是我的");
  assert.match(h, /冬令營海報<\/b> <span class="tag">新的<\/span>/);
  assert.match(h, /IG 貼文<\/b> <span class="tag open">做完了<\/span>/);
  assert.match(h, /<i>Marketing 的回覆：<\/i>做好了/);
  assert.equal((h.match(/data-act="rq-withdraw"/g) || []).length, 1, "只有新的那一張能收回");
  assert.match(h, /class="rq-row off"[\s\S]*?收回的/);
  const d = F.requestPageHTML(ME, [], { kind: "video", title: "草稿", links: "a\nb" }, "", false);
  assert.match(d, /<option value="video" selected>/); assert.match(d, /value="草稿"/); assert.match(d, /你還沒送過需求單/);
  assert.match(F.requestPageHTML(ME, [], null, "", true), /disabled/);
});

test("佇列：預設只列還沒做完的、照狀態分段、篩種類與找字；打開一張看全部欄位；「改」才有狀態與回覆，「看」只看；收回的不用處理", () => {
  assert.deepEqual(F.rqFilter(R, { status: "open" }).map(r => r.title), ["冬令營海報", "回顧影片"]);
  assert.deepEqual(F.rqFilter(R, { status: "done" }).map(r => r.title), ["IG 貼文"]);
  assert.deepEqual(F.rqFilter(R, { status: "all", kind: "other" }).map(r => r.title), ["收回的"]);
  assert.deepEqual(F.rqFilter(R, { status: "all", q: "冬令" }).map(r => r.title), ["冬令營海報"], "找標題或活動");
  const h = F.requestsQueueHTML(R, PEOPLE, { status: "open" }, null, true, "", false);
  assert.match(h, /<h2>新的<span class="hint">1<\/span>/); assert.match(h, /<h2>進行中<span class="hint">1<\/span>/);
  assert.doesNotMatch(h, /IG 貼文/, "做完的不在預設清單");
  assert.match(h, /data-act="rq-open" data-id="11111111-1111-4111-8111-111111111111"/);
  assert.match(h, /小安 \(Ann\)・2026-10-24 送的・2026-12-01 前要・2027 冬令營/);
  assert.match(h, /class="chip on" data-act="rq-fstatus" data-v="open"/);
  const one = F.requestsQueueHTML(R, PEOPLE, {}, R[0].id, true, "", false);
  assert.match(one, /<h1>冬令營海報<\/h1>/); assert.match(one, /小安 \(Ann\) 在 2026-10-24 送的/);
  assert.match(one, /<dd class="pre">A2 直式\n要 QR code<\/dd>/, "說明保留換行");
  assert.match(one, /<a href="https:\/\/drive.google.com\/x" target="_blank" rel="noopener">/);
  assert.match(one, /<select id="rq-status"[^>]*><option value="new" selected>/); assert.match(one, /<textarea id="rq-reply"/);
  assert.match(one, /data-autosave="rq-save"/); assert.match(one, /class="autosave" data-for="rq-save"/, "2026-11-06 起狀態與回覆改了就存"); assert.doesNotMatch(one, /data-act="rq-save"/); assert.match(one, /data-act="rq-done"/); assert.doesNotMatch(one, /<option value="done"/, "還沒做完的單，下拉不給選做完（要按那顆鈕，會寄信）");
  const view = F.requestsQueueHTML(R, PEOPLE, {}, R[0].id, false, "", false);
  assert.doesNotMatch(view, /rq-status|rq-done/); assert.match(view, /改狀態要「改」以上/);
  const done = F.requestsQueueHTML(R, PEOPLE, {}, R[1].id, true, "", false);
  assert.doesNotMatch(done, /data-act="rq-done"/, "做完的沒有再標做完");
  assert.match(F.requestsQueueHTML(R, PEOPLE, {}, R[3].id, true, "", false), /送單的人收回了/);
  assert.match(F.requestsQueueHTML([], PEOPLE, {}, null, true, "", false), /沒有對得上的需求單/);
});

test("總覽的卡：「改」以上看等處理的數；送過單的人看自己最近一張還在跑的；載不到印載不到", () => {
  const cards = (me, rq) => F.todoCards(me, [], [], { requests: rq, roster: [], resources: [], workspaces: [] }, false, false).map(c => `${c.label}|${c.n}|${c.hint}`);
  const m = cards(MKT, R);
  assert.ok(m.some(c => c.startsWith("Marketing 需求單等處理|2|其中 1 張還沒有人接")), m.join("\n"));
  assert.ok(!cards(VIEWER, R).some(c => c.startsWith("Marketing 需求單等處理")), "只有「看」的人不看這張卡");
  const mine = cards(ME, R);
  assert.ok(mine.some(c => c.startsWith("你送的需求單|1|「冬令營海報」新的")), mine.join("\n"));
  assert.ok(!cards({ ...ME, id: "u7" }, R).some(c => c.startsWith("你送的需求單")), "沒送過的人沒有這張卡");
  assert.ok(cards(MKT, null).some(c => c.startsWith("Marketing 需求單等處理|null")), "載不到是 null");
});

test("信件文案多兩種，預覽的代換跟資料庫的 request_fill 同一套符號", () => {
  assert.ok(["request_new", "request_done"].every(v => SITE.MAIL_KINDS.some(k => k.v === v)));
  assert.equal(SITE.fillRequest("{requester}：{title}，{needed_by}，{link}，{reply}", { requester: "A", title: "B", needed_by: "C", link: "D", reply: "E" }), "A：B，C，D，E");
  const h = SITE.mailEditHTML("request_done", { subject: "你的需求單做完了：{title}", body: "{requester} 你好，{reply}" }, "", false);
  assert.match(h, /你的需求單做完了：2027 冬令營報名海報/); assert.match(h, /Mei Wu 你好，做好了/);
  assert.match(h, /\{requester\} 送單的人/);
  const sql = readFileSync("supabase/migrations/2026-10-31-marketing-requests.sql", "utf8");
  for (const v of ["{requester}", "{title}", "{needed_by}", "{link}", "{reply}"]) assert.ok(sql.includes(`'${v}'`), `request_fill 少了 ${v}`);
  assert.match(sql, /kind in \('guardian', 'interview', 'accepted', 'rejected', 'invite', 'request_new', 'request_done'\)/);
});

test("★ 資料層只走三支函式，不直接寫 requests；main.js 接了送、收回、開、存、標做完", () => {
  const d = readFileSync("admin/src/data.js", "utf8"), m = readFileSync("admin/src/main.js", "utf8");
  assert.match(d, /rpc\("submit_request"/); assert.match(d, /rpc\("set_request_status"/); assert.match(d, /rpc\("withdraw_request"/);
  assert.doesNotMatch(d, /from\("requests"\)\s*\.(insert|update|delete)/);
  for (const act of ["rq-submit", "rq-withdraw", "rq-open", "rq-back", "rq-save", "rq-done", "rq-fstatus", "rq-fkind"]) assert.match(m, new RegExp(`act === "${act}"`), `沒接 ${act}`);
  assert.match(m, /UI\.needAsk\(S, b, T\("confirm\.rqWithdraw"/); assert.match(m, /UI\.needAsk\(S, b, T\("confirm\.rqDone"/);
  assert.match(m, /#requests\/" \+ id/, "打開一張會寫進網址");
});

test("★ 英文畫出來不剩中文（送單頁、佇列、一張單）", () => {
  F.setLang("en");
  for (const h of [F.requestPageHTML(ME, F.rqMine(R, ME), null, "", false), F.requestsQueueHTML(R, PEOPLE, {}, null, true, "", false), F.requestsQueueHTML(R, PEOPLE, {}, R[0].id, true, "", false)]) {
    const text = h.replace(/<[^>]+>/g, " ").replace(/冬令營海報|2027 冬令營|IG 貼文|回顧影片|收回的|A2 直式|要 QR code|小安|行銷|做好了/g, "");
    assert.doesNotMatch(text, /[一-鿿]/, "英文模式不該剩中文：" + (text.match(/[^\s]*[一-鿿]+[^\s]*/) || [""])[0]);
  }
  F.setLang("zh");
});
