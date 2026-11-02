// 後台 Marketing：大學介紹貼文（2026-11-27）。資料庫那一半（門、勾、核可）在 scripts/db/smoke.sh 的「大學介紹貼文」一段。
// 這裡驗：投影片版面（純函式）、跟資料庫同一份數字清單、編輯畫面讀回來的形狀、勾的狀態、英文畫面不剩中文。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as SL from "../admin/marketing/src/slides.js";
import * as UI from "../admin/marketing/src/ui.js";

UI.setLang("zh");
const VANDY = JSON.parse(readFileSync(new URL("./fixtures/vanderbilt-post.json", import.meta.url), "utf8"));

test("★ 要勾的數字清單跟資料庫 mkt_facts() 一模一樣（少一個就有數字可以不附來源）", () => {
  const sql = readFileSync("supabase/migrations/2026-11-27-college-posts.sql", "utf8");
  const body = sql.slice(sql.indexOf("create or replace function public.mkt_facts()"), sql.indexOf("$$;", sql.indexOf("create or replace function public.mkt_facts()")));
  const fromSql = [...body.matchAll(/\('([a-z_]+)', array\[([^\]]+)\]\)/g)].map(m => [m[1], m[2].split(",").map(x => x.trim().replace(/'/g, ""))]);
  assert.deepEqual(fromSql, SL.FACTS);
  assert.equal(SL.FACTS.length, 17);
});

test("七張投影片：每一張都有頁首（系列名、線、BT logo），空白的新貼文也畫得出來", () => {
  for (const d of [SL.blankPost("X"), VANDY.data]) {
    const L = SL.layout(d);
    assert.equal(L.length, 7);
    for (const els of L) {
      assert.equal(els[0].text, "COLLEGE INTRO SERIES");
      assert.ok(els.some(e => e.k === "img" && e.src === "logo"));
    }
  }
});

test("★ 申請資訊：沒填的那一行不出現；有考試政策就多一行；值是橘的", () => {
  const rows = SL.applyRows(VANDY.data.apply);
  assert.deepEqual(rows.map(r => r.label), ["Acceptance Rate", "Total Applicants", "GPA Average", "Standardized Testing", "English Proficiency"]);
  assert.equal(rows[3].lines.length, 3);
  const noGpa = SL.applyRows({ ...VANDY.data.apply, gpa: "", test_note: "" });
  assert.ok(!noGpa.some(r => r.label === "GPA Average"));
  assert.equal(noGpa.find(r => r.label === "Standardized Testing").lines.length, 2);
  const texts = SL.layout(VANDY.data)[2].filter(e => e.k === "text").map(e => e.text);
  assert.ok(texts.includes("SAT: <o>1510–1560</o>"));
});

test("時程：幾列就畫幾列（最多 8），長的英文自動縮小；科系名太長中文換到下一行", () => {
  const tl = SL.layout(VANDY.data)[3];
  assert.equal(tl.filter(e => e.k === "box").length, 7);
  assert.equal(tl.find(e => e.text === "ED II & Regular Decision").size, 34);
  assert.equal(tl.find(e => e.text === "Applications Open").size, 40);
  const mj = SL.layout(VANDY.data)[4].filter(e => e.k === "text").map(e => e.text);
  assert.ok(mj.includes("Mathematics") && mj.includes("<zhl>數學</zhl>"), "Mathematics 一行放不下，中文到下一行");
  assert.ok(mj.includes("Economics <zhl>經濟</zhl>"));
});

test("★ 中文一律不斜（Barlow 的斜體套在中文上是假的斜體）", () => {
  const ls = SL.lines({ text: "Ranking 排名", size: 40, weight: 700, italic: true, color: "#000" });
  assert.deepEqual(ls[0].map(r => [r.t, r.italic, r.cjk]), [["Ranking ", true, false], ["排名", false, true]]);
  assert.equal(SL.lines({ text: "a<br>b", size: 10, weight: 400, italic: false, color: "#000" }).length, 2);
});

test("照片裁切：填滿置中；人像從上面裁；logo 整張放進去", () => {
  const f = SL.fitRect(2000, 1000, 400, 400, "cover", "");
  assert.deepEqual([f.sx, f.sy, f.sw, f.sh], [500, 0, 1000, 1000]);
  const t = SL.fitRect(1000, 2000, 400, 400, "cover", "top");
  assert.equal(t.sy, 0);
  const c = SL.fitRect(652, 331, 128, 65, "contain");
  assert.ok(c.dw <= 128 && c.dh <= 65);
});

test("★ 編輯畫面讀回來：路徑變成巢狀、陣列；空的來源丟掉；沒有路徑的照片丟掉", () => {
  const r = UI.readEditor({
    "d.school": "Rice University", "d.basic.ranking": "#17", "d.timeline.rows.0.date": "Nov 1", "d.timeline.rows.0.en": "Early Decision",
    "d.timeline.rows.1.date": "Jan 4", "s.rank.0.kind": "usnews", "s.rank.0.url": "https://www.usnews.com/x", "s.rank.0.quote": "#17",
    "s.rank.1.kind": "cds", "s.rank.1.url": "", "s.rank.1.quote": "", "s.sat.0.kind": "cds", "s.sat.0.url": "", "s.sat.0.quote": "",
    "d.photos.campus.path": "", "d.photos.campus.credit": "x", "d.photos.city1.path": "id/city1.jpg", "caption": "hi",
  });
  assert.equal(r.data.basic.ranking, "#17");
  assert.deepEqual(r.data.timeline.rows.map(x => x.date), ["Nov 1", "Jan 4"]);
  assert.deepEqual(r.sources, { rank: [{ kind: "usnews", url: "https://www.usnews.com/x", quote: "#17" }] });
  assert.deepEqual(Object.keys(r.data.photos), ["city1"]);
  assert.equal(r.caption, "hi");
});

test("★ 勾的狀態照資料庫算的「還差什麼」：勾了有效、勾過但改了、還沒勾、沒填不用勾", () => {
  const p = { id: "p1", checks: { rank: { by: "u", at: "2026-10-31T10:00:00Z" }, sat: { by: "u", at: "2026-10-31T10:00:00Z" } } };
  const boot = { problems: { p1: ["unchecked:sat", "unchecked:act"] }, names: { u: "王平" } };
  assert.equal(UI.factState(p, boot, "rank"), "ok");
  assert.equal(UI.factState(p, boot, "sat"), "stale");
  assert.equal(UI.factState(p, boot, "act"), "todo");
  assert.equal(UI.factState(p, boot, "gpa"), "");
  assert.deepEqual(UI.factCount(p, boot), { need: 3, done: 1 });
  assert.match(UI.factBadge(p, boot, "rank"), /王平 2026-10-31 確認過/);
  assert.equal(UI.isStale("2025-10-01T00:00:00Z", Date.parse("2026-11-01")), true);
});

test("caption 字數與 hashtag：超過 IG 上限會說", () => {
  assert.match(UI.captionCount("#a #b hi"), /8 字、2 個 hashtag/);
  assert.match(UI.captionCount("x".repeat(2201)), /超過了/);
  assert.match(UI.captionCount(Array.from({ length: 31 }, (_, i) => "#t" + i).join(" ")), /超過了/);
});

test("★ 誰看得到哪顆鈕：作者不會有核可、草稿還差東西送不了、發出去的就鎖住", () => {
  const base = { id: "p1", school: "Vanderbilt University", status: "in_review", data: VANDY.data, sources: VANDY.sources, checks: {}, caption: "", created_by: "me" };
  const boot = { can_edit: true, can_approve: true, me: "me", problems: { p1: [] }, hashes: { p1: "h" }, names: {} };
  const own = UI.postEditorHTML(base, boot, "", false, {}, {});
  assert.doesNotMatch(own, /data-act="cp-approve"/);
  assert.match(own, /另一位核可的人/);
  const other = UI.postEditorHTML(base, { ...boot, me: "someone" }, "", false, {}, {});
  assert.match(other, /data-act="cp-approve"/);
  const draft = UI.postEditorHTML({ ...base, status: "draft" }, { ...boot, problems: { p1: ["unchecked:sat", "photo:campus"] } }, "", false, {}, {});
  assert.match(draft, /data-act="cp-submit" disabled/);
  assert.match(draft, /SAT、封面的校園照/);
  const posted = UI.postEditorHTML({ ...base, status: "posted", posted_url: "https://www.instagram.com/p/x/" }, boot, "", false, {}, {});
  assert.match(posted, /name="d\.apply\.sat" value="[^"]*" placeholder="[^"]*" disabled/);
  assert.doesNotMatch(posted, /data-act="cp-archive"/);
});

test("★ 英文畫出來不剩中文（使用者填的值與 placeholder 不算）", () => {
  const en = JSON.parse(JSON.stringify(VANDY));
  const strip = o => { for (const k in o) { if (typeof o[k] === "string") o[k] = o[k].replace(/[　-鿿＀-￯]/g, ""); else if (o[k] && typeof o[k] === "object") strip(o[k]); } };
  strip(en);
  const p = { id: "p1", school: "Vanderbilt University", status: "draft", data: en.data, sources: en.sources, checks: { rank: { by: "u", at: "2026-10-31T10:00:00Z" } }, caption: "", created_by: "u", created_at: "2026-10-31T10:00:00Z" };
  const boot = { can_edit: true, can_approve: true, me: "x", problems: { p1: ["unchecked:sat", "photo:campus"] }, hashes: {}, names: { u: "Paul" } };
  UI.setLang("en");
  try {
    for (const h of [UI.postsListHTML([p], boot, "", false, false), UI.postEditorHTML(p, boot, "", false, { returning: true }, {}),
                     UI.postEditorHTML({ ...p, status: "approved" }, boot, "", false, { posting: true }, {})]) {
      const left = h.replace(/ placeholder="[^"]*"/g, "").replace(/<textarea[^>]*>[^<]*<\/textarea>/g, "").match(/[　-鿿＀-￯]/);
      assert.equal(left, null, left ? h.slice(Math.max(0, h.indexOf(left[0]) - 60), h.indexOf(left[0]) + 30) : "");
    }
  } finally { UI.setLang("zh"); }
});

test("檔名：學校名變成小寫英數與連字號", () => {
  assert.equal(SL.slug("Vanderbilt University"), "vanderbilt");
  assert.equal(SL.slug("University of Wisconsin-Madison"), "wisconsin-madison");
});

// 假的量字工具：每個字寬 0.5 x 字級，夠用來測位置。
const fakeCtx = { font: "", measureText(t) { const m = this.font.match(/(\d+)px/); return { width: t.length * (m ? +m[1] : 10) * 0.5 }; } };
const T0 = { k: "text", x: 108, y: 173, w: 900, h: 110, size: 82, weight: 800, italic: true, color: "#000000", align: "left", valign: "middle", lh: 1.15 };

test("★ Canva：同一行有兩種字級就拆成兩個框，位置跟預覽一樣", () => {
  const e = { ...T0, text: "POPULAR MAJORS <zh>熱門科系</zh>" };
  const layout = SL.layoutText(fakeCtx, e);
  const boxes = SL.pptxTextBoxes(e, layout);
  assert.equal(boxes.length, 2);
  assert.deepEqual(boxes.map(b => b.lines[0].map(r => r.size)), [[82], [50]]);
  assert.equal(boxes[0].x, 108);
  assert.equal(boxes[1].x, layout[0].items.find(it => it.r.cjk).x);        // 中文從預覽上中文開始的地方開始
  assert.ok(boxes.every(b => !b.wrap));
});

test("★ Canva：只有一種字級的單行框往對齊方向留寬，不拆", () => {
  const left = SL.pptxTextBoxes({ ...T0, text: "APPLICATION TIMELINE" }, SL.layoutText(fakeCtx, { ...T0, text: "APPLICATION TIMELINE" }));
  assert.equal(left.length, 1); assert.equal(left[0].x, 108); assert.equal(left[0].x + left[0].w, SL.W - 8);
  const c = { ...T0, align: "center", x: 300, w: 480, text: "FUN FACTS" };
  const mid = SL.pptxTextBoxes(c, SL.layoutText(fakeCtx, c))[0];
  assert.ok(mid.x < 300 && mid.x + mid.w > 780); assert.equal(mid.x + mid.w / 2, 540);   // 中心不動
  const wrapped = { ...T0, wrap: true, text: "Sources: a long footnote" };
  assert.ok(SL.pptxTextBoxes(wrapped, SL.layoutText(fakeCtx, wrapped))[0].w > 900);
});
