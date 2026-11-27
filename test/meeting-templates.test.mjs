// 會議範本與會議紀錄（2026-11-13，supabase/migrations/2026-12-18-meeting-templates.sql）。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as RAIL from "../shared/rail.js";

F.setLang("zh");
const ME = { id: "u2", role: "cadre", board: "member", team: "Curriculum Team", senior: false, ws: {} };
const PRES = { ...ME, id: "u1", board: "president", senior: true };
const TPL = [
  { id: "t1", title: "週會", scope: "board", archived: false, sections: [{ h: "上週進度", hint: "每個 team 一兩句" }, { h: "要決定的事", hint: "" }] },
  { id: "t2", title: "Team 會議", scope: null, archived: false, sections: [{ h: "這週做了什麼", hint: "" }, { h: "卡住的地方", hint: "" }] },
  { id: "t3", title: "舊的", scope: "board", archived: true, sections: [{ h: "a", hint: "" }] },
];
const M = { id: "m1", scope: "board", title: "週會", starts_at: "2026-11-20T10:00:00Z", ends_at: "2026-11-20T11:00:00Z", created_by: "u1",
  attendees: [{ user_id: "u2", status: "accepted" }], template_id: null, minutes: [] };

test("換範本：小標題一樣的段落把字帶過去，新範本沒有但有字的接在最後面", () => {
  const cur = [{ h: "要決定的事", text: "決定 A" }, { h: "其他", text: "筆記" }, { h: "空的", text: "" }];
  const out = F.mtMinutesFrom(TPL[0], cur);
  assert.deepEqual(out.map(x => x.h), ["上週進度", "要決定的事", "其他"]);
  assert.equal(out[1].text, "決定 A");
  assert.equal(out[2].text, "筆記");
  assert.equal(out[0].hint, "每個 team 一兩句");
});
test("不用範本：留下有標題或有字的段落；什麼都沒有給一個空段", () => {
  assert.deepEqual(F.mtMinutesFrom(null, [{ h: "x", text: "" }]).map(x => x.h), ["x"]);
  assert.equal(F.mtMinutesFrom(null, []).length, 1);
});
test("下拉選單：封存的不列（除非這一場正在用），這種會專用的排前面", () => {
  assert.deepEqual(F.mtTplOptions(TPL, "board").map(t => t.id), ["t1", "t2"]);
  assert.deepEqual(F.mtTplOptions(TPL, "Marketing Team").map(t => t.id), ["t2", "t1"]);
  assert.ok(F.mtTplOptions(TPL, "board", "t3").some(t => t.id === "t3"));
});
test("新開一場預設選這種會專用的那一份；沒有就不選", () => {
  assert.equal(F.mtDefaultTpl(TPL, "board"), "t1");
  assert.equal(F.mtDefaultTpl(TPL, "Marketing Team"), null);
});
test("誰寫得了紀錄：排得了的人、出席名單上的人、建會的人（跟資料庫同一條）", () => {
  assert.equal(F.mtCanWrite(M, ME, false), true);                       // 名單上
  assert.equal(F.mtCanWrite(M, { ...ME, id: "u9" }, false), false);     // 不在名單、不是建會的
  assert.equal(F.mtCanWrite(M, { ...ME, id: "u9" }, true), true);       // 排得了
  assert.equal(F.mtCanWrite({ ...M, attendees: [] }, PRES, false), true); // 建會的
});
test("寫得了：每段一個打字框、存檔框是 mt-min、範本下拉不觸發自動存", () => {
  const h = F.minutesSectionHTML(M, ME, false, TPL, null, false);
  assert.match(h, /data-autosave="mt-min"/);
  assert.match(h, /id="mtm-tpl" data-noauto="1"/);
  assert.equal((h.match(/<textarea class="mtm-t"/g) || []).length, 2); // 預設套了週會範本的兩段
  assert.match(h, /placeholder="每個 team 一兩句"/);
});
test("寫不了：照段落印出來，沒有打字框", () => {
  const m = { ...M, minutes: [{ h: "要決定的事", text: "決定 A\n決定 B" }, { h: "空", text: "" }] };
  const h = F.minutesSectionHTML(m, { ...ME, id: "u9" }, false, TPL, null, false);
  assert.doesNotMatch(h, /textarea/);
  assert.match(h, /<h4>要決定的事<\/h4><p>決定 A<br>決定 B<\/p>/);
  assert.doesNotMatch(h, /<h4>空<\/h4>/);
});
test("資料庫還沒跑（沒有 minutes 欄）整塊不畫；範本表還沒建就只能讀", () => {
  const { minutes, ...old } = M;
  assert.equal(F.minutesSectionHTML(old, ME, true, TPL, null, false), "");
  assert.doesNotMatch(F.minutesSectionHTML(M, ME, true, null, null, false), /textarea/);
});
test("記一場會議：選得到範本、每段一個框", () => {
  const h = F.meetingNewHTML(["board"], null, [], "", false, TPL);
  assert.match(h, /id="mtn-tpl"/);
  assert.match(h, /class="mtm-t"/);
  assert.doesNotMatch(F.meetingNewHTML(["board"], null, [], "", false, null), /mtn-tpl/);
});
test("範本頁：改得動的人有新增與改；改不動的只能看；表還沒建講清楚要跑哪一支", () => {
  const ed = F.mtplPageHTML(TPL, ["board", "Marketing Team"], null, "", false, true);
  assert.match(ed, /data-act="mtpl-new"/);
  assert.match(ed, /data-act="mtpl-edit" data-id="t1"/);
  assert.match(ed, /data-act="mtpl-restore" data-id="t3"/);
  const ro = F.mtplPageHTML(TPL, ["board"], null, "", false, false);
  assert.doesNotMatch(ro, /mtpl-new|mtpl-edit/);
  assert.match(F.mtplPageHTML(null, ["board"], null, "", false, true), /2026-12-18-meeting-templates\.sql/);
  const open = F.mtplPageHTML(TPL, ["board"], { id: "t1", title: "週會", scope: "board", sections: TPL[0].sections }, "", false, true);
  assert.equal((open.match(/data-mtpl-sec/g) || []).length, 2);
  assert.match(open, /data-act="mtpl-up" data-i="0" aria-label="[^"]*" disabled/);
});
test("側欄：範本那一頁只有派進「會議範本」的人與 senior 看得到", () => {
  const it = RAIL.ITEMS.find(i => i.key === "mtemplates");
  assert.equal(it.area, "meetings", "2026-11-27：會議與範本從行事曆底下拿出來，「我的」那一段自己一行");
  assert.equal(RAIL.canSee(it, ME), false);
  assert.equal(RAIL.canSee(it, { ...ME, ws: { "custom:meeting-templates": "edit" } }), true);
  assert.equal(RAIL.canSee(it, PRES), true);
});
test("遷移檔：寫紀錄的門有 coalesce（建會的人是空的時候不會漏掉）、smoke 有跑這一支", () => {
  const sql = readFileSync(new URL("../supabase/migrations/2026-12-18-meeting-templates.sql", import.meta.url), "utf8");
  assert.match(sql, /coalesce\(v_m\.created_by = auth\.uid\(\), false\)/);
  assert.match(readFileSync(new URL("../scripts/db/smoke.sh", import.meta.url), "utf8"), /2026-12-18-meeting-templates\.sql/);
});
