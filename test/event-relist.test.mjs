// 撤下來的活動可以再上去（2026-11-25）。跑法：node --test test/*.test.mjs
// Paul 2026-11-25（貼著「上架」那一塊的截圖，上面只有一句話、沒有按鈕）：
//   「how do i push that live agian? lke now I have no where to puch it live again」
// 原因：撤下來之後狀態是 archived，畫面沒有畫任何按鈕，資料庫的 set_event_ready() 也只收 draft 與 ready。兩邊一起補。
// 這一支守畫面與遷移檔的字；資料庫真的跑一次在 scripts/db/smoke.sh 最後那一段。資料全是假的。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import { says } from "../admin/src/data.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const WS = "apps:Marketing Team";
const EV = { id: "e1", slug: "winter-camp-2027", team: "Marketing Team", workspace_id: WS, form_id: null, title_zh: "2027 冬令營", title_en: "Winter Camp 2027",
  summary_zh: "", summary_en: "", body_zh: "", body_en: "", cover_url: null, cover_consent: false,
  starts_at: new Date(Date.now() + 864e5 * 30).toISOString(), ends_at: null, place: "台北", capacity: 40, status: "archived", published_at: "2026-11-20T03:00:00Z", kind: "bootcamp" };
const BASE = { role: "cadre", board: "member", team: "Marketing Team", name: "小安", senior: false, pres: false, ws: {} };
const PRES = { ...BASE, id: "u1", board: "president", senior: true, pres: true };
const MANAGER = { ...BASE, id: "u2", board: "director", ws: { [WS]: "manage" } };
const EDITOR = { ...BASE, id: "u3", ws: { [WS]: "edit" } };
const page = (ev, me) => F.eventEditHTML(ev, null, null, me, "", false);

test("★ 撤下來的活動：上架那一塊有一顆「再準備好一次」，叫的是原本那一條 ev-ready；那一句話講兩步", () => {
  F.setLang("en");
  const h = page(EV, PRES);
  assert.match(h, /<button class="btn" data-act="ev-ready" data-id="e1">Mark ready again<\/button>/);
  assert.match(h, /Unpublished; not visible publicly\. To put it back: press Mark ready again, then Publish\./);
  assert.doesNotMatch(h, /data-act="ev-publish"|data-act="ev-unpublish"|data-act="ev-unready"/, "撤下來的時候只有這一顆");
  F.setLang("zh");
  assert.match(page(EV, PRES), /撤下來了，對外看不到。要再上去：先按「再準備好一次」，再按「放上對外頁」。/);
  assert.match(page(EV, MANAGER), /data-act="ev-ready" data-id="e1">再準備好一次</, "那個工作區「管」的人也按得了，跟第一次一樣");
  assert.doesNotMatch(page(EV, EDITOR), /data-act="ev-ready"/, "只有「改」的人沒有，跟第一次一樣");
});

test("★ 只在紀錄裡的舊活動（archived、沒上過對外頁）沒有那一顆，那一句話也不叫人去按", () => {
  F.setLang("en");
  const old = page({ ...EV, published_at: null, source: "import" }, PRES);
  assert.doesNotMatch(old, /data-act="ev-ready"/); assert.doesNotMatch(old, /Mark ready again/);
  assert.match(old, /A past event kept for the records only\. It was never published and cannot be\./);
});

test("其他三種狀態的按鈕沒有變", () => {
  F.setLang("en");
  const d = page({ ...EV, status: "draft", published_at: null }, PRES);
  assert.match(d, /data-act="ev-ready" data-id="e1">Mark ready</); assert.doesNotMatch(d, /Mark ready again/);
  const r = page({ ...EV, status: "ready", published_at: null }, PRES);
  assert.match(r, /data-act="ev-unready"/); assert.match(r, /data-act="ev-publish"/); assert.doesNotMatch(r, /data-act="ev-ready"/);
  const p = page({ ...EV, status: "published" }, PRES);
  assert.match(p, /data-act="ev-unpublish"/); assert.doesNotMatch(p, /data-act="ev-ready"/);
});

test("★ 遷移檔：只多收「上過對外頁的 archived」，誰按得了與那幾項檢查都沒有變；放上對外頁那一支沒有動", () => {
  const sql = read("supabase/migrations/2027-01-09-relist-events.sql").replace(/--[^\n]*/g, "");
  assert.match(sql, /if not public\.can_manage\(e\.workspace_id\) then raise exception 'not_allowed'/);
  assert.match(sql, /if e\.status = 'archived' and e\.published_at is null then raise exception 'not_relistable'/);
  assert.match(sql, /if e\.status not in \('draft', 'ready', 'archived'\) then raise exception 'already_published'/);
  for (const k of ["need_both_titles", "need_start", "consent_required", "not_ready"]) assert.ok(sql.includes(k), k);
  assert.doesNotMatch(sql, /create or replace function public\.(publish_event|unpublish_event|save_event)\b/, "只重寫 set_event_ready");
  assert.doesNotMatch(sql, /create table|alter table|create policy|drop policy/i, "沒有新的表、沒有動 RLS");
  assert.match(sql, /revoke all on function public\.set_event_ready\(uuid, boolean\) from public, anon;/);
  // 跟原本那一版逐行比：只多那一行判斷，與 not in 裡多一個 archived
  const body = s => s.slice(s.indexOf("create or replace function public.set_event_ready"), s.indexOf("end $$;", s.indexOf("create or replace function public.set_event_ready"))).replace(/--[^\n]*/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  const was = body(read("supabase/migrations/2026-12-31-programmes.sql")), now = body(read("supabase/migrations/2027-01-09-relist-events.sql"));
  const added = now.filter(l => !was.includes(l)), gone = was.filter(l => !now.includes(l));
  assert.deepEqual(gone, ["if e.status not in ('draft', 'ready') then raise exception 'already_published' using errcode = 'P0001'; end if;"]);
  assert.deepEqual(added, ["if e.status = 'archived' and e.published_at is null then raise exception 'not_relistable' using errcode = 'P0001'; end if;",
    "if e.status not in ('draft', 'ready', 'archived') then raise exception 'already_published' using errcode = 'P0001'; end if;"]);
  assert.ok(read("scripts/db/smoke.sh").includes("2027-01-09-relist-events.sql"), "smoke.sh 的清單是寫死的，要自己加");
});

test("資料庫還是舊的時候，按了會說要跑哪一支，不會說「已經在對外頁上了」", () => {
  const m = read("admin/src/main.js");
  assert.match(m, /const oldDb = act === "ev-ready" && ev\.status === "archived" && \/already_published\/\.test\(/);
  assert.match(m, /\(oldDb \? T\("err\.evRelistSql"\) : D\.says\(e\)\)/);
  assert.match(read("admin/src/strings.js"), /"err\.evRelistSql":[^\n]*2027-01-09-relist-events\.sql/);
  F.setLang("en");
  assert.match(says(new Error("not_relistable")), /records-only past event/);
});
