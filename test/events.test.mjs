// 活動上架（2026-11-01，docs/2026-10-24-活動上架.md）批 2：後台。跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as SITE from "../admin/site/src/ui.js";
import * as PA from "../admin/passports/src/ui.js";
import * as PE from "../admin/people/src/ui.js";

F.setLang("zh");
const WS = "custom:event-winter-camp-2027";
const ASSOC = { id: "u2", role: "cadre", board: "member", team: "Curriculum Team", name: "小安", senior: false, pres: false, ws: {} };
const DIR = { ...ASSOC, id: "u5", board: "director", team: "Marketing Team", ws: { "res:Marketing Team": "manage", [WS]: "manage" } };
const EDITOR = { ...ASSOC, id: "u6", ws: { [WS]: "edit" } };
const PRES = { ...ASSOC, id: "u1", board: "president", senior: true, pres: true };
const EV = { id: "e1", slug: "winter-camp-2027", team: "Marketing Team", workspace_id: WS, form_id: "f1", title_zh: "2027 冬令營", title_en: "Winter Camp 2027",
  summary_zh: "三天兩夜", summary_en: "Three days", body_zh: "說明", body_en: "Body", cover_url: "https://drive.google.com/cover.jpg", cover_consent: true,
  starts_at: "2027-01-20T01:00:00Z", ends_at: "2027-01-22T09:00:00Z", place: "台北", capacity: 40, status: "draft", published_at: null };
const FORM = { id: "f1", status: "draft", opens_at: null, title: "2027 冬令營" };
const EVS = [EV, { ...EV, id: "e2", slug: "ready-one", title_zh: "準備好的", title_en: "Ready one", status: "ready" },
  { ...EV, id: "e3", slug: "live-one", title_zh: "上線的", title_en: "Live one", status: "published" },
  { ...EV, id: "e4", slug: "old-one", title_zh: "過去的", title_en: "Old one", status: "published", starts_at: "2025-01-01T00:00:00Z", ends_at: "2025-01-02T00:00:00Z" },
  { ...EV, id: "e5", slug: "pulled", title_zh: "撤下的", title_en: "Pulled", status: "archived", form_id: null }];

test("★ 側欄四份都有「活動」（幹部都看得到）；工作區那一格連到那一場；總覽的「你的存取」直達", () => {
  for (const M of [F, SITE, PA, PE]) {
    const it = M.ITEMS.find(i => i.key === "events"); assert.equal(it.who, "cadre"); assert.ok(M.canSee(it, ASSOC));
    assert.equal(M.wsCellHref({ id: WS, kind: "custom" }), "/admin/#events/winter-camp-2027");
    assert.equal(M.wsTeamOf({ id: WS, kind: "custom", team: "Marketing Team" }, []), "Marketing Team", "落在那個 team 的那一列");
  }
});

test("清單：照狀態分段（準備好了、草稿、在對外頁上、過去的與撤下的）；能開活動的人才有「開一場活動」", () => {
  const h = F.eventsListHTML(EVS, PRES, [], null, "", false, ["Marketing Team", "Curriculum Team"]);
  for (const g of ["準備好了，等上線", "草稿", "在對外頁上", "過去的與撤下的"]) assert.match(h, new RegExp(`<h2>${g}<span class="hint">`));
  assert.match(h, /<h2>過去的與撤下的<span class="hint">2</, "過去的 published 與 archived 都算這一段");
  assert.match(h, /data-act="ev-open" data-slug="winter-camp-2027"/);
  assert.match(h, /撤下的<\/a><\/b> <span class="tag">撤下了<\/span>/); assert.match(h, /・不開放報名/);
  assert.match(h, /<select id="ev-team"[^>]*><option value="Marketing Team">Marketing<\/option>/);
  assert.match(h, /data-act="ev-create"/); assert.match(h, /id="ev-withform" checked/);
  assert.doesNotMatch(F.eventsListHTML(EVS, ASSOC, [], null, "", false, []), /ev-create/, "不能開活動的人沒有那張表單");
  assert.match(F.eventsListHTML([], ASSOC, [], null, "", false, []), /還沒有活動/);
  assert.equal(F.evSlug("Winter Camp 2027!"), "winter-camp-2027");
  assert.ok(F.evPast(EVS[3])); assert.ok(!F.evPast(EV));
});

test("一場活動：草稿時「管」有準備好了、ready 時 senior 有放上對外頁而「管」只看到等一句、published 有撤下與看對外頁；「看」的人唯讀；報名入口三個", () => {
  const draft = F.eventEditHTML(EV, FORM, 3, DIR, "", false);
  assert.match(draft, /data-act="ev-ready" data-id="e1"/); assert.doesNotMatch(draft, /ev-publish/);
  assert.match(draft, /<input id="ev-cover" name="cover_url" value="https:\/\/drive.google.com\/cover.jpg"/); assert.match(draft, /id="ev-consent" name="cover_consent" checked/);
  assert.match(draft, /<img class="ev-cover" src="https:\/\/drive.google.com\/cover.jpg"/);
  assert.match(draft, /data-act="open-form" data-id="f1"/); assert.match(draft, /data-act="open-apps" data-id="f1">報名的人：3<\/a> \/ 40/);
  assert.match(draft, /data-act="open-checkin" data-id="f1"/); assert.match(draft, /data-act="open-notice" data-id="f1"/);
  assert.match(draft, /data-act="members-open" data-ws="custom:event-winter-camp-2027"/);
  assert.match(draft, /data-autosave="ev-save" data-id="e1"/); assert.match(draft, /class="autosave" data-for="ev-save"/, "2026-11-06 起內容改了就存，沒有存起來那顆鈕"); assert.doesNotMatch(draft, /data-act="ev-save"/);
  const ready = { ...EV, status: "ready" };
  assert.match(F.eventEditHTML(ready, FORM, 0, DIR, "", false), /等 Co-President 放上去/);
  assert.doesNotMatch(F.eventEditHTML(ready, FORM, 0, DIR, "", false), /ev-publish/, "「管」自己放不上去");
  assert.match(F.eventEditHTML(ready, FORM, 0, DIR, "", false), /data-act="ev-unready"/);
  assert.match(F.eventEditHTML(ready, FORM, 0, PRES, "", false), /data-act="ev-publish" data-id="e1"/);
  const live = F.eventEditHTML({ ...EV, status: "published" }, FORM, 0, PRES, "", false);
  assert.match(live, /data-act="ev-unpublish"/); assert.match(live, /href="\/events\/\?e=winter-camp-2027"/);
  const view = F.eventEditHTML(EV, FORM, 0, ASSOC, "", false);
  assert.match(view, /<input id="ev-tzh" name="title_zh" value="2027 冬令營" readonly/); assert.doesNotMatch(view, /ev-save|ev-ready|members-open/); assert.match(view, /改不動/);
  const editor = F.eventEditHTML(EV, FORM, 0, EDITOR, "", false);
  assert.match(editor, /data-autosave="ev-save"/); assert.doesNotMatch(editor, /ev-ready/, "「改」存得了但按不了準備好了");
  assert.match(F.eventEditHTML({ ...EV, form_id: null }, null, null, DIR, "", false), /這場還沒有報名表/);
});

test("總覽的卡：senior 看「等上線的活動」數（ready 的）；一般幹部沒有這張卡", () => {
  const cards = me => F.todoCards(me, [], [], { events: EVS, roster: [], resources: [], workspaces: [] }, false, false).map(c => `${c.label}|${c.n}`);
  assert.ok(cards(PRES).includes("等上線的活動|1"), cards(PRES).join("\n"));
  assert.ok(!cards(DIR).some(c => c.startsWith("等上線的活動")));
});

test("★ 資料層只走函式、不直接寫 events；main.js 接了開、存、準備好了、退回、放上、撤下，放上與撤下先問一次", () => {
  const d = readFileSync("admin/src/data.js", "utf8"), m = readFileSync("admin/src/main.js", "utf8");
  for (const fn of ["create_event", "save_event", "set_event_ready", "publish_event", "unpublish_event"]) assert.match(d, new RegExp(`"${fn}"`), `data.js 沒叫 ${fn}`);
  assert.doesNotMatch(d, /from\("events"\)\s*\.(insert|update|delete)/);
  for (const act of ["ev-open", "ev-back", "ev-create", "ev-save", "ev-ready", "ev-publish"]) assert.match(m, new RegExp(`"${act}"`), `沒接 ${act}`);
  assert.match(m, /UI\.needAsk\(S, b, T\("confirm\.evPublish"/); assert.match(m, /UI\.needAsk\(S, b, T\("confirm\.evUnpublish"/);
  const sql = readFileSync("supabase/migrations/2026-11-01-events.sql", "utf8");
  assert.match(sql, /perform public\.require_senior\(\);\s*select \* into e from events/, "publish_event 第一句是 require_senior");
  assert.match(sql, /grant execute on function public\.public_events\(\), public\.public_event\(text\) to anon/);
  assert.match(sql, /raise exception 'full'/);
});

test("★ 英文畫出來不剩中文（清單、一場活動）", () => {
  F.setLang("en");
  for (const h of [F.eventsListHTML(EVS, PRES, [], null, "", false, ["Marketing Team"]), F.eventEditHTML(EV, FORM, 2, PRES, "", false)]) {
    const text = h.replace(/<[^>]+>/g, " ").replace(/2027 冬令營|準備好的|上線的|過去的|撤下的|三天兩夜|說明|台北/g, "");
    assert.doesNotMatch(text, /[一-鿿]/, "英文模式不該剩中文：" + (text.match(/[^\s]*[一-鿿]+[^\s]*/) || [""])[0]);
  }
  F.setLang("zh");
});

test("封面網址像不像一張圖（存檔前先擋）：空的可以、https 加圖的副檔名可以、Drive／Cloudinary 可以、其他擋", () => {
  for (const ok of ["", "https://x/y.jpg", "https://x/y.PNG?w=800", "https://x/a/b.webp", "https://drive.google.com/uc?id=abc", "https://drive.google.com/file/d/abc/view", "https://lh3.googleusercontent.com/d/abc", "https://res.cloudinary.com/bt/image/upload/v1/a.jpg", "https://images.unsplash.com/photo-1"]) assert.ok(F.evCoverOk(ok), ok);
  for (const bad of ["http://x/y", "https://drive.google.com/drive/folders/abc", "https://x/page.html", "ftp://x/y.jpg", "x.jpg", "https://docs.google.com/document/d/abc"]) assert.ok(!F.evCoverOk(bad), bad);
  const m = readFileSync("admin/src/main.js", "utf8");
  assert.match(m, /if \(!UI\.evCoverOk\(patch\.cover_url\)\) return fail\(T\("err\.evCover"\)\)/, "2026-11-06 起封面那一關在 onAutosave 裡擋");
});

// 2026-11-10 Paul：「application should live under events」，活動、報名、紀錄、行銷、錢接成一條。
test("★ 其他申請：綁著活動的報名表移到最下面一段，點了回那場活動；其他表單照 team 分", () => {
  const forms = [{ id: "f1", team: "Marketing Team", kind: "program", title: "2027 冬令營", status: "open", counts: { total: 3, received: 1 } },
    { id: "f9", team: "Curriculum Team", kind: "program", title: "導生計畫", status: "open", counts: { total: 5, received: 0 } }];
  const h = F.listHTML(forms, true, "", true, null, [], "", false, [], [EV]);
  assert.match(h, /<h2>活動的報名表/); assert.match(h, /data-act="ev-open" data-slug="winter-camp-2027">2027 冬令營<\/a>/);
  assert.match(h, /導生計畫/); assert.doesNotMatch(h, /data-act="open-apps" data-id="f1"/, "活動的報名表不再從這裡審");
  assert.doesNotMatch(F.listHTML(forms, true, "", true, null, [], "", false, [], []), /<h2>活動的報名表/, "沒有活動就沒有那一段");
});
test("★ 報名表的頁首：屬於活動就寫「某某的報名表」，返回鍵回那場活動", () => {
  const h = F.formHeadHTML({ ...FORM, status: "open", _ev: { ...EV, status: "draft" } }, "apps", 2);
  assert.match(h, /「2027 冬令營」的報名表/); assert.match(h, /data-act="ev-back-to" data-id="winter-camp-2027"/);
  assert.match(h, /活動上架之後報名表才會出現在 \/apply\//, "活動還沒上架、表單開著，提醒一句");
  assert.match(F.formHeadHTML(FORM, "apps", 2), /data-act="back-list"/, "不屬於活動的照舊回清單");
});
test("★ 活動頁：沒有報名表時「改」的人有「加一張報名表」；紀錄那一段有種類、屆別、記分卡連結", () => {
  const noForm = { ...EV, form_id: null, kind: "workshop", term_id: "2026-27" };
  assert.match(F.eventEditHTML(noForm, null, 0, EDITOR, "", false, [], []), /data-act="ev-attach-form" data-id="e1"/);
  assert.doesNotMatch(F.eventEditHTML(noForm, null, 0, ASSOC, "", false, [], []), /ev-attach-form/, "只有「看」的人沒有那顆");
  const h = F.eventEditHTML(noForm, null, 0, EDITOR, "", false, [], [{ id: "2026-27" }, { id: "2025-26" }]);
  assert.match(h, /<option value="workshop" selected>/); assert.match(h, /<option value="2026-27" selected>/);
  assert.match(h, /href="\/admin\/records\/#overview\/e1"/);
  assert.match(F.eventEditHTML(noForm, null, 0, ASSOC, "", false, [], []), /<select id="ev-kind" data-id="e1" disabled>/);
});
test("★ 行銷與錢：需求單列出來；錢只有拿得到的人才畫（money 是 null 就沒有那一行）", () => {
  const withMoney = F.eventLinksHTML(EV, { money: { income: 0, expense: 8000, n: 2 }, requests: [{ id: "r1", title: "冬令營海報", kind: "post", status: "in_progress" }] }, false);
  assert.match(withMoney, /冬令營海報/); assert.match(withMoney, /支出 NT\$8,000/); assert.match(withMoney, /data-act="ev-ask-mkt" data-id="e1"/);
  const noMoney = F.eventLinksHTML(EV, { money: null, requests: [] }, false);
  assert.doesNotMatch(noMoney, /NT\$|收支/); assert.match(noMoney, /還沒有掛在這場的需求單/);
});
test("需求單：從活動頁帶過來的 event_id 跟著送出，沒有就不帶", () => {
  assert.equal(F.rqPayload({ ...F.rqBlank(), kind: "post", title: "x", event_id: "e1" }).event_id, "e1");
  assert.ok(!("event_id" in F.rqPayload({ ...F.rqBlank(), kind: "post", title: "x" })));
});

// 2026-11-11 Paul：活動清單要能篩，「開一場活動」收成一行放最上面。
test("活動清單：搜尋、狀態與 team 篩選，開活動收在最上面", async () => {
  const { eventsListHTML, eventMatches, evGroup } = await import("../admin/src/ui.js");
  const later = new Date(Date.now() + 864e5 * 30).toISOString(), before = new Date(Date.now() - 864e5 * 30).toISOString();
  const evs = [
    { slug: "winter-camp", title_zh: "冬令營", title_en: "Winter Camp", team: "Curriculum Team", status: "published", starts_at: later, form_id: "f1" },
    { slug: "talk-2025", title_zh: "講座", title_en: "Talk", team: "Community Relations Team", status: "published", starts_at: before, place: "台大" },
    { slug: "draft-one", title_zh: "草稿活動", title_en: "", team: "Curriculum Team", status: "draft" },
    { slug: "old-camp", title_zh: "舊營隊", title_en: "Old camp", team: "Curriculum Team", status: "archived", source: "import" },
  ];
  assert.deepEqual(evs.map(evGroup), ["published", "past", "draft", "records"]);
  assert.ok(eventMatches(evs[1], { q: "台大" }), "地點也找得到");
  assert.ok(eventMatches(evs[0], { q: "winter camp" }), "空白不算");
  assert.ok(!eventMatches(evs[0], { st: "past" }));
  assert.ok(eventMatches(evs[2], { st: "prep", team: "Curriculum Team" }));
  assert.ok(!eventMatches(evs[1], { team: "Curriculum Team" }));
  const h = eventsListHTML(evs, {}, [], null, "", false, ["Curriculum Team"], { q: "", st: "all", team: "" }, false);
  assert.ok(h.indexOf('id="ev-new"') < h.indexOf('id="ev-q"'), "開活動在搜尋上面");
  assert.match(h, /<details class="fold rc-fold" id="ev-new"><summary>/, "預設收著");
  assert.match(h, /data-act="ev-fst" data-v="all" aria-pressed="true">全部 4</);
  assert.match(h, /<select id="ev-fteam"/, "兩個以上的 team 才有 team 篩選");
  const f = eventsListHTML(evs, {}, [], null, "", false, ["Curriculum Team"], { q: "冬", st: "all", team: "" }, false);
  assert.match(f, /冬令營/); assert.doesNotMatch(f, /草稿活動/);
  const none = eventsListHTML(evs, {}, [], null, "", false, [], { q: "zzz", st: "all", team: "" }, false);
  assert.match(none, /data-act="ev-fclear"/, "篩到沒有給一顆清掉");
  assert.doesNotMatch(none, /id="ev-new"/, "不能開活動的人沒有那一格");
  assert.match(eventsListHTML(evs, {}, [], { title_zh: "x" }, "", false, ["Curriculum Team"], {}, false), /id="ev-new" open/, "填到一半還開著");
});

test("會議清單：記一場會議收在最上面，搜尋只藏列", async () => {
  const { meetingsListHTML, meetingMatches } = await import("../admin/src/ui.js");
  const mk = (id, title, d) => ({ id, title, scope: "board", starts_at: d, ends_at: d, attendees: [] });
  const ms = [mk("a", "BT 會議", "2026-12-01T10:00:00Z"), mk("b", "Curriculum 討論", "2026-12-02T10:00:00Z"), mk("c", "年度回顧", "2025-01-01T10:00:00Z"), mk("d", "其他", "2025-02-01T10:00:00Z")];
  assert.ok(meetingMatches(ms[1], "curriculum")); assert.ok(!meetingMatches(ms[0], "curriculum"));
  const h = meetingsListHTML(ms, null, ["board"], null, [], "", false, "回顧", false);
  assert.ok(h.indexOf('id="mt-new"') < h.indexOf('id="mtl-q"'), "記一場會議在上面");
  assert.match(h, /<li data-mt-row data-id="a" hidden>/); assert.match(h, /<li data-mt-row data-id="c">/);
  assert.doesNotMatch(h, /<h2>記一場會議/, "收起來那一格裡不再有第二個標題");
});
