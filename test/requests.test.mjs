// 行銷需求單（2026-10-31 第一版，2026-11-09 第二版：docs/2026-11-08-行銷需求單-第二版欄位.md）。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as SITE from "../admin/site/src/ui.js";
import * as PA from "../admin/passports/src/ui.js";
import * as PE from "../admin/people/src/ui.js";
import * as FI from "../admin/finance/src/ui.js";

F.setLang("zh"); SITE.setLang("zh");
const TODAY = "2026-11-09";
const ME = { id: "u2", role: "cadre", board: "member", team: "Curriculum Team", name: "小安", senior: false, pres: false, ws: {} };
const MKT = { ...ME, id: "u5", name: "行銷", ws: { "custom:marketing-requests": "edit" } };
const VIEWER = { ...ME, id: "u6", ws: { "custom:marketing-requests": "view" } };
const PEOPLE = [
  { id: "u2", name_zh: "小安", name_en: "Ann", board_role: "member", team: "Curriculum Team" },
  { id: "u3", name_zh: "阿哲", name_en: "Jay", board_role: "director", team: "Curriculum Team, Mentorship Team" },
  { id: "u5", name_zh: "行銷", name_en: "", board_role: "director", team: "Marketing Team" },
];
const ASSIGNEES = [{ id: "u5", name_zh: "行銷", name_en: "", level: "edit" }, { id: "u7", name_zh: "小美", name_en: "Mei", level: "manage" }];
const SHOTS = [
  { who: "拍攝者 A", what: "先縮時做事或通話", seconds: 20, note: "縮時", is_closing: false },
  { who: "B", what: "看鏡頭揮手", seconds: null, note: "", is_closing: false },
  { who: "全員", what: "", seconds: 8, note: "室內", is_closing: true },
];
const R = [
  { id: "11111111-1111-4111-8111-111111111111", kind: "video", title: "C-2 bootcamp 報名倒數", requester: "u2", status: "submitted", reply: "", created_at: "2026-11-09T03:00:00Z",
    owner_id: "u2", owner_team: "Curriculum Team", goal_cta: "讓高中生點 bio 連結報名", platforms: ["ig_carousel", "other"], platform_other: "LINE 群組",
    key_line: "最後三天", must_have: [{ text: "截止 12/1 23:59", confirmed_by: "Jay" }, { text: "報名連結", confirmed_by: "" }],
    draft: "- 一\n- 二", draft_doc_url: "https://docs.google.com/d/1", visual_refs: [{ url: "https://instagram.com/p/x", note: "字的排法" }],
    publish_on: "2026-11-12", other_notes: "週末前發", assignee: null, shots: SHOTS },
  { id: "22222222-2222-4222-8222-222222222222", kind: "post", title: "IG 貼文", requester: "u2", status: "published", reply: "發了", created_at: "2026-10-20T03:00:00Z",
    platforms: [], must_have: [], visual_refs: [], shots: [], assignee: "u5", publish_on: "2026-10-30" },
  { id: "33333333-3333-4333-8333-333333333333", kind: "video", title: "回顧影片", requester: "u9", status: "in_progress", reply: "", created_at: "2026-10-22T03:00:00Z",
    platforms: ["fb_single"], must_have: [], visual_refs: [], shots: [], assignee: "u5", publish_on: "2026-12-30" },
  { id: "44444444-4444-4444-8444-444444444444", kind: "other", title: "收回的", requester: "u2", status: "withdrawn", reply: "", created_at: "2026-10-21T03:00:00Z", platforms: [], must_have: [], visual_refs: [], shots: [] },
  { id: "55555555-5555-4555-8555-555555555555", kind: "poster", title: "待審的海報", requester: "u9", status: "in_review", reply: "", created_at: "2026-10-23T03:00:00Z", platforms: ["ig_story"], must_have: [], visual_refs: [], shots: [], assignee: "u7" },
  // 第一版留下的舊單：沒有新欄位，狀態還是舊的字（資料庫還沒跑第二版的那幾分鐘也會長這樣）。
  { id: "66666666-6666-4666-8666-666666666666", kind: "poster", title: "舊的海報", purpose: "2027 冬令營", needed_by: "2026-12-01", brief: "A2 直式", asset_links: ["https://drive.google.com/x"], contact: "LINE: ann", requester: "u2", status: "new", reply: "", created_at: "2026-10-19T03:00:00Z" },
];

test("★ 側欄：每一位幹部有「跟 Marketing 提需求」；佇列只給需求工作區裡的人與靠職級的兩級；五份 ITEMS 一樣", () => {
  for (const M of [F, SITE, PA, PE, FI]) {
    const req = M.ITEMS.find(i => i.key === "request"), queue = M.ITEMS.find(i => i.key === "requests");
    assert.equal(req.who, "cadre"); assert.equal(queue.who, "ws:custom:marketing-requests");
    assert.ok(M.canSee(req, ME)); assert.ok(!M.canSee(queue, ME), "沒被派的幹部看不到佇列");
    assert.ok(M.canSee(queue, VIEWER)); assert.ok(M.canSee(queue, { ...ME, board: "senior_adviser" }));
    assert.equal(M.wsCellHref({ id: "custom:marketing-requests", kind: "custom" }), "/admin/#requests", "Workspaces 那一格連到佇列");
  }
});

test("★ 狀態對照：舊的 new／done 讀成已送出／已發布，四個新狀態加退件、收回原樣", () => {
  assert.deepEqual(F.RQ_STATUS, ["submitted", "in_progress", "in_review", "published", "rejected", "withdrawn"]);
  assert.equal(F.rqStatus("new"), "submitted"); assert.equal(F.rqStatus("done"), "published");
  for (const s of F.RQ_STATUS) assert.equal(F.rqStatus(s), s);
  assert.equal(F.rqStatus(undefined), "submitted");
});

test("★ 7 天規則：預計發布日早於今天加 7 天就警告（只警告不擋），沒填不警告", () => {
  assert.equal(F.rqTooSoon("2026-11-15", TODAY), true, "第 6 天");
  assert.equal(F.rqTooSoon("2026-11-16", TODAY), false, "剛好第 7 天不警告");
  assert.equal(F.rqTooSoon("2026-11-01", TODAY), true, "過去的日期也警告");
  assert.equal(F.rqTooSoon("", TODAY), false);
  assert.equal(F.rqTooSoon("not-a-date", TODAY), false);
});

test("★ 送單的表單：11 格照 Sheet 的順序、每一格旁邊有說明、拍攝指示 F1 到 F7 加固定的結尾話、範例是灰字、送出是按鈕", () => {
  const h = F.requestPageHTML(ME, [], Object.assign(F.rqBlank(), { kind: "video" }), "", false, PEOPLE, TODAY);
  const ns = [...h.matchAll(/class="rq-f" data-n="(\d+)"/g)].map(m => +m[1]);
  assert.deepEqual(ns, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "11 格、照順序");
  const labels = ["Tag 與貼文名稱", "需求負責人", "目標與 CTA", "平台與類型", "一句話重點", "一定要有的資訊", "文案草稿或 bullet", "視覺參考", "預計發布日", "其他備註", "狀態"];
  let at = 0;
  for (const l of labels) { const i = h.indexOf(l, at); assert.ok(i > at, `「${l}」要照順序出現`); at = i; }
  assert.equal((h.match(/class="rq-help"/g) || []).length, 11, "每一格一段說明");
  assert.match(h, /例：C-2 bootcamp 報名倒數。系列的話寫第幾則/); assert.match(h, /Marketing 有問題只找你/);
  assert.match(h, /看的人只會記得一句，是哪句/);
  for (const id of ["rq-title", "rq-goal", "rq-pf-other", "rq-key", "rq-draft", "rq-doc", "rq-publish", "rq-notes"]) assert.match(h, new RegExp(`id="${id}"`), id);
  for (const p of F.RQ_KIND_PF.video) assert.match(h, new RegExp(`type="checkbox" id="rq-pf-${p}"`), `平台 ${p} 是勾選框`);
  assert.match(h, /IG Reels/); assert.match(h, /長影片/); assert.doesNotMatch(h, /id="rq-pf-ig_carousel"/, "影片不出現貼文的平台");
  assert.match(h, /id="rq-must-text-0"/); assert.match(h, /id="rq-must-by-0"/); assert.match(h, /data-act="rq-add-must"/);
  assert.match(h, /id="rq-ref-url-0"/); assert.match(h, /id="rq-ref-note-0"/); assert.match(h, /data-act="rq-add-ref"/);
  for (let i = 1; i <= 7; i++) assert.match(h, new RegExp(`<th scope="row">F${i}</th>`), `F${i}`);
  assert.doesNotMatch(h, /<th scope="row">F8<\/th>/);
  assert.match(h, /data-act="rq-add-shot"/);
  assert.match(h, /秒數是成品裡的長度，拍的時候多拍一倍/);
  assert.match(h, /<th scope="row">結尾話<\/th>/); assert.match(h, /每人一句、一人一行、5 到 10 秒、室內錄就好/);
  assert.match(h, /id="rq-shot-what-0"[^>]*placeholder="先縮時做事或通話，約 20 秒，開頭要有看鏡頭揮手之類的示意畫面"/, "Sheet 的範例放在 F1 當灰字");
  assert.match(h, /id="rq-shot-who-0"[^>]*placeholder="拍攝者 A"/);
  assert.match(h, /data-act="rq-submit"/);
  assert.match(h, /id="rq-publish-warn"[^>]*hidden/, "沒填日期，警告藏著");
  assert.match(h, /data-n="11"[\s\S]*?送出之後由 Marketing 填/, "第 11 格是 Marketing 填的，表單上只說明");
  assert.match(h, /草稿存在這台電腦/, "說明草稿留在本機");
});

test("★ 7 天警告：發布日太近，黃色警告顯示出來，送出鈕還是按得了", () => {
  const h = F.requestPageHTML(ME, [], Object.assign(F.rqBlank(), { kind: "post", title: "x", publish_on: "2026-11-12" }), "", false, PEOPLE, TODAY);
  assert.match(h, /<div class="rq-warn" id="rq-publish-warn" role="status">/);
  assert.match(h, /至少要在送單後 7 天/);
  assert.match(h, /<button class="btn" data-act="rq-submit">/, "不擋送出");
  const ok = F.requestPageHTML(ME, [], Object.assign(F.rqBlank(), { kind: "post", publish_on: "2026-11-30" }), "", false, PEOPLE, TODAY);
  assert.match(ok, /id="rq-publish-warn"[^>]*hidden/);
});

test("★ 負責人就是登入的人：不給選人；一個 team 直接印，兩個 team 才給選是哪一個", () => {
  const one = F.requestPageHTML(ME, [], Object.assign(F.rqBlank(), { kind: "post" }), "", false, PEOPLE, TODAY);
  assert.match(one, /<div class="rq-owner"><b>小安（你）<\/b> <span class="mini">Curriculum Team<\/span><\/div>/);
  assert.doesNotMatch(one, /id="rq-owner"[ >]/, "沒有選人的下拉"); assert.doesNotMatch(one, /id="rq-owner-team"/, "一個 team 不用選");
  const two = F.requestPageHTML({ ...ME, team: "Curriculum Team, Marketing Team" }, [], Object.assign(F.rqBlank(), { kind: "post", owner_team: "Marketing Team" }), "", false, PEOPLE, TODAY);
  assert.match(two, /<select id="rq-owner-team"><option value="Curriculum Team">Curriculum Team<\/option><option value="Marketing Team" selected>/);
  assert.deepEqual(F.rqMyTeams({ team: "A、B" }), ["A", "B"]); assert.deepEqual(F.rqMyTeams(null), []);
});

test("可以多列的三塊：畫出幾列就是幾列，每列有刪掉鈕，第 8 列以後的 Fragment 自動編號", () => {
  const d = Object.assign(F.rqBlank(), { kind: "video",
    must: [{ text: "日期", confirmed_by: "Jay" }, { text: "地點", confirmed_by: "" }, { text: "", confirmed_by: "" }],
    refs: [{ url: "https://a", note: "顏色" }, { url: "", note: "" }],
    shots: Array.from({ length: 9 }, (_, i) => ({ who: i === 0 ? "A" : "", what: "", seconds: "", note: "" })),
  });
  const h = F.requestPageHTML(ME, [], d, "", false, PEOPLE, TODAY);
  assert.equal((h.match(/id="rq-must-text-\d+"/g) || []).length, 3); assert.match(h, /id="rq-must-by-0" value="Jay"/);
  assert.equal((h.match(/data-act="rq-del-must"/g) || []).length, 3);
  assert.equal((h.match(/id="rq-ref-url-\d+"/g) || []).length, 2);
  assert.match(h, /<th scope="row">F9<\/th>/); assert.equal((h.match(/data-act="rq-del-shot"/g) || []).length, 9);
});

test("★ 送出去的那一包：空列丟掉、結尾話放最後、沒有 assignee、勾的平台與其他", () => {
  const d = Object.assign(F.rqBlank(), {
    title: " C-2 ", owner_team: "Curriculum Team", owner_id: "u3", goal_cta: "報名", platforms: ["ig_story", "other"], platform_other: "LINE",
    key_line: "三天", must: [{ text: "日期", confirmed_by: "Jay" }, { text: " ", confirmed_by: "x" }], draft: "草稿", draft_doc_url: "",
    refs: [{ url: "https://a", note: "顏色" }, { url: "", note: "沒網址" }], publish_on: "2026-11-30", other_notes: "",
  });
  d.shots[0] = { who: "A", what: "縮時", seconds: "20", note: "" };
  d.closing = { who: "全員", seconds: "8", note: "" };
  const p = F.rqPayload(d);
  assert.equal(p.title, "C-2");
  assert.ok(!("assignee" in p), "送單的人不送接的人");
  assert.deepEqual(p.platforms, ["ig_story", "other"]); assert.equal(p.platform_other, "LINE");
  assert.deepEqual(p.must_have, [{ text: "日期", confirmed_by: "Jay" }]);
  assert.deepEqual(p.visual_refs, [{ url: "https://a", note: "顏色" }]);
  assert.equal(p.shots.length, 2, "七列空的丟掉剩一列，加結尾話");
  assert.deepEqual(p.shots[0], { who: "A", what: "縮時", seconds: "20", note: "", is_closing: false });
  assert.equal(p.shots[1].is_closing, true); assert.equal(p.shots[1].who, "全員"); assert.match(p.shots[1].what, /每人一句/);
  const plain = F.rqPayload(Object.assign(F.rqBlank(), { title: "海報" }));
  assert.deepEqual(plain.shots, [], "沒有拍攝指示就不送結尾話");
  assert.equal(plain.publish_on, "");
});

test("我送過的：四個狀態的字、舊單照對照表、只有已送出能收回、收回的淡掉、Marketing 的回覆與接的人印出來", () => {
  const mine = F.rqMine(R, ME);
  assert.equal(mine.length, 4, "u9 的不是我的");
  const h = F.requestPageHTML(ME, mine, null, "", false, PEOPLE, TODAY);
  assert.match(h, /C-2 bootcamp 報名倒數<\/b> <span class="tag">已送出<\/span>/);
  assert.match(h, /IG 貼文<\/b> <span class="tag open">已發布<\/span>/);
  assert.match(h, /舊的海報<\/b> <span class="tag">已送出<\/span>/, "舊的 new 讀成已送出");
  assert.match(h, /<i>Marketing 的回覆：<\/i>發了/);
  assert.match(h, /接的人：行銷/);
  assert.equal((h.match(/data-act="rq-withdraw"/g) || []).length, 2, "已送出的兩張（含舊單）能收回");
  assert.match(h, /class="rq-row off"[\s\S]*?收回的/);
  assert.match(F.requestPageHTML(ME, [], null, "", false, PEOPLE, TODAY), /你還沒送過需求單/);
  assert.match(F.requestPageHTML(ME, [], F.rqBlank(), "", true, PEOPLE, TODAY), /disabled/);
});

test("★ 佇列：照四個狀態分段、篩選、找字、我接的；每一列有平台、負責人、發布日、接的人", () => {
  assert.deepEqual(F.rqFilter(R, { status: "open" }).map(r => r.title), ["C-2 bootcamp 報名倒數", "回顧影片", "待審的海報", "舊的海報"]);
  assert.deepEqual(F.rqFilter(R, { status: "published" }).map(r => r.title), ["IG 貼文"]);
  assert.deepEqual(F.rqFilter(R, { status: "withdrawn" }).map(r => r.title), ["收回的"]);
  assert.deepEqual(F.rqFilter(R, { status: "all", q: "最後三天" }).map(r => r.title), ["C-2 bootcamp 報名倒數"], "找一句話重點也找得到");
  assert.deepEqual(F.rqFilter(R, { status: "open", mine: "u5" }).map(r => r.title), ["回顧影片"], "我接的");
  const h = F.requestsQueueHTML(R, PEOPLE, { status: "open" }, null, true, "", false, { assignees: ASSIGNEES, today: TODAY, me: MKT });
  const order = ["已送出", "進行中", "待審核"].map(s => h.indexOf(`<h2>${s}<span class="hint">`));
  assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2], "三段照順序");
  assert.match(h, /<h2>已送出<span class="hint">2<\/span>/);
  assert.doesNotMatch(h, /IG 貼文/, "已發布的不在預設清單");
  assert.match(h, /IG 輪播、其他：LINE 群組/);
  assert.match(h, /負責：Curriculum Team・小安 \(Ann\)/);
  assert.match(h, /2026-11-12 發布 <span class="tag warn">不到 7 天<\/span>/);
  assert.match(h, /還沒有人接/); assert.match(h, /接的人：小美 \(Mei\)/);
  assert.match(h, /class="chip on" data-act="rq-fstatus" data-v="open"/); assert.match(h, /data-act="rq-fmine"/);
  assert.match(F.requestsQueueHTML([], PEOPLE, {}, null, true, "", false, {}), /沒有對得上的需求單/);
});

test("★ 打開一張：每一格都印出來（含拍攝表與結尾話）、有「列印」、接的人從工作區選、狀態改了就存、已發布要按鈕", () => {
  const one = F.requestsQueueHTML(R, PEOPLE, {}, R[0].id, true, "", false, { assignees: ASSIGNEES, today: TODAY, me: MKT });
  assert.match(one, /<h1>C-2 bootcamp 報名倒數<\/h1>/); assert.match(one, /小安 \(Ann\) 在 2026-11-09 送的/);
  for (const s of ["讓高中生點 bio 連結報名", "IG 輪播", "LINE 群組", "最後三天", "截止 12/1 23:59", "（Jay 確認過）", "週末前發", "字的排法"]) assert.ok(one.includes(s), s);
  assert.match(one, /<dd class="pre">- 一\n- 二<\/dd>/, "草稿保留換行");
  assert.match(one, /<a href="https:\/\/docs.google.com\/d\/1" target="_blank" rel="noopener">/);
  assert.match(one, /2026-11-12 <span class="tag warn">不到 7 天<\/span>/);
  assert.match(one, /<table class="rq-shots">/); assert.match(one, /<th scope="row">F1<\/th><td>拍攝者 A<\/td><td>先縮時做事或通話<\/td><td>20<\/td><td>縮時<\/td>/);
  assert.match(one, /<th scope="row">F2<\/th><td>B<\/td><td>看鏡頭揮手<\/td><td><\/td>/);
  assert.match(one, /<th scope="row">結尾話<\/th><td>全員<\/td><td>每人一句、一人一行、5 到 10 秒、室內錄就好<\/td><td>8<\/td>/);
  assert.match(one, /data-act="rq-print"/);
  assert.match(one, /class="rq-print"/, "列印的那一塊有自己的 class，列印樣式靠它");
  assert.match(one, /<select id="rq-assignee" name="assignee"><option value="">（還沒有人接）<\/option><option value="u5">行銷<\/option><option value="u7">小美 \(Mei\)<\/option>/);
  // 已送出：先接下或退件，還沒有進度下拉、也沒有發布鈕。
  assert.doesNotMatch(one, /id="rq-status"/, "還沒接下不能改進度"); assert.doesNotMatch(one, /data-act="rq-publish"/);
  assert.match(one, /data-act="rq-accept"/); assert.match(one, /data-act="rq-reject"/); assert.match(one, /退件的話一定要寫原因/);
  assert.match(one, /data-autosave="rq-save"/); assert.match(one, /<textarea id="rq-reply" name="reply"/);
  // 接下之後（進行中）：進度只有進行中、待審核兩個；發布是按鈕（會寄信），也還能退件。
  const work = F.requestsQueueHTML(R, PEOPLE, {}, R[2].id, true, "", false, { assignees: ASSIGNEES, today: TODAY, me: MKT });
  assert.match(work, /<select id="rq-status" name="status"><option value="in_progress" selected>進行中<\/option><option value="in_review">待審核<\/option><\/select>/, "下拉不給選已發布（要按鈕，會寄信）");
  assert.match(work, /data-act="rq-publish"/); assert.match(work, /已發出，通知送單的人/); assert.match(work, /data-act="rq-reject"/); assert.doesNotMatch(work, /data-act="rq-accept"/);
  // 退件：說明信寄了，可以改回進行中，沒有其他鈕。
  const rej = F.requestsQueueHTML([{ ...R[2], status: "rejected", reply: "重複了" }], PEOPLE, {}, R[2].id, true, "", false, { assignees: ASSIGNEES, today: TODAY });
  assert.match(rej, /原因已經寄給送單的人/); assert.match(rej, /data-act="rq-reopen"/); assert.doesNotMatch(rej, /rq-status|rq-publish|rq-accept|rq-reject"/);
  assert.match(rej, /<dd>退件・/);
  const pub = F.requestsQueueHTML(R, PEOPLE, {}, R[1].id, true, "", false, { assignees: ASSIGNEES, today: TODAY, me: MKT });
  assert.doesNotMatch(pub, /data-act="rq-publish"/); assert.match(pub, /<option value="published" selected>已發布<\/option>/, "已發布的可以退回");
  assert.match(pub, /<option value="u5" selected>/);
  const view = F.requestsQueueHTML(R, PEOPLE, {}, R[0].id, false, "", false, { assignees: ASSIGNEES, today: TODAY });
  assert.doesNotMatch(view, /rq-status|rq-publish|rq-assignee|rq-accept|rq-reject/); assert.match(view, /改狀態要「改」以上/);
  assert.match(view, /data-act="rq-print"/, "只有「看」的人也能列印");
  assert.match(F.requestsQueueHTML(R, PEOPLE, {}, R[3].id, true, "", false, {}), /送單的人收回了/);
  const old = F.requestsQueueHTML(R, PEOPLE, {}, R[5].id, true, "", false, { assignees: ASSIGNEES, today: TODAY });
  for (const s of ["2027 冬令營", "A2 直式", "LINE: ann", "https://drive.google.com/x", "2026-12-01"]) assert.ok(old.includes(s), "舊單的第一版欄位也印出來：" + s);
  assert.match(old, /data-act="rq-accept"/, "舊的 new 讀成已送出，一樣先接下或退件");
});

test("★ 列印樣式：@media print 把側欄、頂欄、按鈕、處理那一塊藏起來，只印那一張單", () => {
  const css = readFileSync("admin/admin.css", "utf8");
  const m = css.match(/@media print\s*\{([\s\S]*?)\n\}/); assert.ok(m, "admin.css 有 @media print");
  for (const sel of [".rail", ".btnav", ".no-print", ".toast"]) assert.ok(m[1].includes(sel), "列印時藏 " + sel);
  assert.match(m[1], /\.rq-shots/);
});

test("總覽的卡：「改」以上看等處理的數（已送出、進行中、待審核）與還沒人接的；送過單的人看自己最近一張還在跑的", () => {
  const cards = (me, rq) => F.todoCards(me, [], [], { requests: rq, roster: [], resources: [], workspaces: [] }, false, false).map(c => `${c.label}|${c.n}|${c.hint}`);
  const m = cards(MKT, R);
  assert.ok(m.some(c => c.startsWith("Marketing 需求單等處理|4|其中 2 張還沒有人接")), m.join("\n"));
  assert.ok(!cards(VIEWER, R).some(c => c.startsWith("Marketing 需求單等處理")), "只有「看」的人不看這張卡");
  const mine = cards(ME, R);
  assert.ok(mine.some(c => c.startsWith("你送的需求單|2|「C-2 bootcamp 報名倒數」已送出")), mine.join("\n"));
  assert.ok(!cards({ ...ME, id: "u7" }, R).some(c => c.startsWith("你送的需求單")), "沒送過的人沒有這張卡");
  assert.ok(cards(MKT, null).some(c => c.startsWith("Marketing 需求單等處理|null")), "載不到是 null");
});

test("★ 信件文案：done 那封改叫已發布（中英），預覽的代換跟資料庫同一套；第二版遷移檔換的是中英四欄、改過的不動", () => {
  assert.ok(["request_new", "request_done"].every(v => SITE.MAIL_KINDS.some(k => k.v === v)));
  const k = SITE.MAIL_KINDS.find(x => x.v === "request_done");
  assert.match(SITE.T(k.label), /已發布/); assert.match(SITE.T(k.when), /已發布/);
  SITE.setLang("en"); assert.match(SITE.T(k.label), /published/i); assert.match(SITE.T(k.when), /published/i); SITE.setLang("zh");
  assert.equal(SITE.fillRequest("{requester}：{title}，{needed_by}，{link}，{reply}", { requester: "A", title: "B", needed_by: "C", link: "D", reply: "E" }), "A：B，C，D，E");
  const h = SITE.mailEditHTML("request_done", { subject: "你的需求單已發布：{title}", body: "{requester} 你好，{reply}" }, "", false);
  assert.match(h, /你的需求單已發布：C-2 bootcamp 報名倒數/); assert.match(h, /Mei Wu 你好，發了/);
  assert.match(h, /\{needed_by\} 預計發布日/);
  const sql = readFileSync("supabase/migrations/2026-11-09-marketing-requests-v2.sql", "utf8");
  for (const c of ["subject_zh = '你的需求單已發布：{title}'", "subject_en = 'Your request is published: {title}'"]) assert.ok(sql.includes(c), c);
  assert.match(sql, /where kind = 'request_done' and subject_zh = '你的需求單做完了：\{title\}'/, "只換還是預設值的");
});

test("★ 資料層只走函式，不直接寫 requests；main.js 接了所有動作；草稿存在 localStorage、送出才清", () => {
  const d = readFileSync("admin/src/data.js", "utf8"), m = readFileSync("admin/src/main.js", "utf8");
  assert.match(d, /rpc\("submit_request", \{ p_req:/); assert.match(d, /rpc\("set_request_status"/); assert.match(d, /rpc\("withdraw_request"/);
  assert.match(d, /rpc\("set_request_assignee"/); assert.match(d, /rpc\("request_assignees"/);
  assert.doesNotMatch(d, /from\("requests"\)\s*\.(insert|update|delete)/);
  for (const col of ["owner_id", "platforms", "must_have", "visual_refs", "publish_on", "shots", "assignee"]) assert.ok(d.includes(col), "loadRequests 要讀 " + col);
  for (const act of ["rq-submit", "rq-withdraw", "rq-open", "rq-back", "rq-save", "rq-publish", "rq-print", "rq-fstatus", "rq-fmine",
                     "rq-add-must", "rq-del-must", "rq-add-ref", "rq-del-ref", "rq-add-shot", "rq-del-shot"]) assert.match(m, new RegExp(`act === "${act}"`), `沒接 ${act}`);
  assert.match(m, /UI\.needAsk\(S, b, T\("confirm\.rqWithdraw"/); assert.match(m, /UI\.needAsk\(S, b, T\("confirm\.rqPublish"/);
  assert.match(m, /localStorage/); assert.match(m, /UI\.rqDraftKey\(/);
  assert.match(m, /window\.print\(\)/);
  assert.equal(F.rqDraftKey({ id: "u2" }), "bt.admin.rqDraft.v2.u2");
  assert.match(d, /return \{\s*id: userId,/, "loadMe() 要帶 id：「我送過的」、總覽的兩張卡、草稿的 key 都靠 me.id");
});

test("★ 英文畫出來不剩中文（送單頁、佇列、一張單）", () => {
  F.setLang("en");
  const user = /C-2 bootcamp 報名倒數|讓高中生點 bio 連結報名|LINE 群組|最後三天|截止 12\/1 23:59|報名連結|一|二|字的排法|週末前發|拍攝者 A|先縮時做事或通話|縮時|看鏡頭揮手|全員|室內|IG 貼文|發了|回顧影片|收回的|待審的海報|舊的海報|2027 冬令營|A2 直式|小安|阿哲|行銷|小美/g;
  const d = Object.assign(F.rqBlank(), { publish_on: "2026-11-10" });
  for (const h of [F.requestPageHTML(ME, F.rqMine(R, ME), d, "", false, PEOPLE, TODAY), F.requestsQueueHTML(R, PEOPLE, {}, null, true, "", false, { assignees: ASSIGNEES, today: TODAY }),
                   F.requestsQueueHTML(R, PEOPLE, {}, R[0].id, true, "", false, { assignees: ASSIGNEES, today: TODAY })]) {
    const text = h.replace(/<[^>]+>/g, " ").replace(user, "");
    assert.doesNotMatch(text, /[一-鿿]/, "英文模式不該剩中文：" + (text.match(/[^\s]*[一-鿿]+[^\s]*/) || [""])[0]);
    const ph = [...h.matchAll(/placeholder="([^"]*)"/g)].map(x => x[1]).join(" ");
    assert.doesNotMatch(ph, /[一-鿿]/, "英文模式的灰字範例也要是英文：" + ph);
  }
  F.setLang("zh");
});

// 2026-10-28 Paul：「先選貼文還是影片，需求單長得不一樣，貼文不需要拍攝指示。」
test("★ 需求單先選種類：沒選只看得到三張卡；貼文沒有拍攝指示、限動也沒有平台、影片兩樣都有；送出那一包帶種類", () => {
  const blank = F.requestPageHTML(ME, [], F.rqBlank(), "", false, PEOPLE, TODAY);
  for (const k of ["post", "story", "video"]) assert.match(blank, new RegExp(`data-act="rq-kind" data-v="${k}"`));
  assert.doesNotMatch(blank, /id="rq-title"/, "沒選種類不出現表單"); assert.doesNotMatch(blank, /data-act="rq-submit"/);
  const post = F.requestPageHTML(ME, [], Object.assign(F.rqBlank(), { kind: "post" }), "", false, PEOPLE, TODAY);
  assert.match(post, /class="rq-kindbtn on"[^>]*data-v="post"/);
  assert.doesNotMatch(post, /id="rq-shots"/, "貼文沒有拍攝指示"); assert.match(post, /id="rq-pf-ig_carousel"/); assert.doesNotMatch(post, /id="rq-pf-ig_reels"/);
  const story = F.requestPageHTML(ME, [], Object.assign(F.rqBlank(), { kind: "story" }), "", false, PEOPLE, TODAY);
  assert.doesNotMatch(story, /id="rq-shots"/); assert.doesNotMatch(story, /class="rq-pf"/, "限動不用選平台");
  assert.deepEqual([...story.matchAll(/class="rq-f" data-n="(\d+)"/g)].map(m => +m[1]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "少了平台那一格，號碼照順序重排");
  const video = F.requestPageHTML(ME, [], Object.assign(F.rqBlank(), { kind: "video" }), "", false, PEOPLE, TODAY);
  assert.match(video, /id="rq-shots"/);
  const pp = F.rqPayload(Object.assign(F.rqBlank(), { kind: "post", title: "x", platforms: ["ig_carousel", "ig_reels"], shots: [{ who: "A", what: "拍", seconds: "3", note: "" }] }));
  assert.equal(pp.kind, "post"); assert.deepEqual(pp.platforms, ["ig_carousel"], "貼文不送影片的平台"); assert.deepEqual(pp.shots, [], "貼文不送拍攝指示");
  assert.deepEqual(F.rqPayload(Object.assign(F.rqBlank(), { kind: "story", title: "x" })).platforms, ["ig_story"]);
  const vp = F.rqPayload(Object.assign(F.rqBlank(), { kind: "video", title: "x", platforms: ["ig_reels"], shots: [{ who: "A", what: "拍", seconds: "3", note: "" }] }));
  assert.equal(vp.shots.length, 2, "影片帶拍攝指示加結尾話");
  const sql = readFileSync("supabase/migrations/2026-11-19-request-kinds.sql", "utf8");
  for (const k of ["post", "video"]) for (const p of F.RQ_KIND_PF[k].filter(x => x !== "other")) assert.ok(sql.includes(`'${p}'`), `資料庫認得 ${p}`);
});
