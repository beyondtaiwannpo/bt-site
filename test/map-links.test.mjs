// 活動地點與場地的 Google 地圖連結（2026-11-24，supabase/migrations/2027-01-05-map-links.sql）。跑法：node --test test/*.test.mjs
// Paul：「for when and where, for where I need to be able to post Google Map link. Same for the venue.」
//
// 這一支守三件事：
//   1. 「只收 Google 地圖的連結」這一條規則有三份（資料庫、後台、對外頁），三份要是同一條。
//   2. 後台：那一格在「時間與地點」裡、自己存（不走整頁那條改了就存）、遷移檔沒跑就不畫；場地頁多一格；「用場地的連結」要按了才抄。
//   3. 對外的活動頁：有連結才印，印之前再對一次規則；場地的連結不會自己跑到對外頁。
// 資料庫那一半（誰存得了、對外回什麼）在 scripts/db/smoke.sh 最後一段，那裡是真的跑。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as P from "../events/src/ui.js";
import { STRINGS } from "../admin/src/strings.js";

F.setLang("zh");
const read = f => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const count = (s, re) => (s.match(re) || []).length;
const sql = read("supabase/migrations/2027-01-05-map-links.sql");
const GOOD = ["https://maps.app.goo.gl/AbCdEf123", "https://goo.gl/maps/abc", "https://www.google.com/maps/place/Taipei+Main+Station/@25.04,121.51,17z",
  "https://google.com/maps?q=25.04,121.51", "https://www.google.com.tw/maps/place/x", "https://maps.google.com/?q=25.04,121.51", "https://maps.google.com.tw/maps?q=x"];
const BAD = ["http://maps.app.goo.gl/abc", "https://example.com/maps", "https://www.google.com.evil.example/maps/x", "https://www.google.com/search?q=maps", "https://www.google.com/mapsfake",
  "javascript:alert(1)", "https://maps.app.goo.gl/a b", 'https://maps.app.goo.gl/a"><script>', "https://maps.app.goo.gl/a'onclick", "https://maps.app.goo.gl/" + "a".repeat(600), "maps.app.goo.gl/abc", "//maps.app.goo.gl/abc"];

const DIR = { role: "cadre", board: "member", ws: { "custom:event-winter": "manage" } };
const VIEWER = { role: "cadre", board: "member", ws: { "custom:event-winter": "view" } };
const EV = { id: "e1", slug: "winter", team: "Curriculum Team", workspace_id: "custom:event-winter", status: "draft", title_zh: "冬令營", title_en: "Winter", place: "Taipei", capacity: 40,
  starts_at: "2027-01-03T01:00:00Z", ends_at: null, cover_url: null, cover_consent: false, venue_id: null, map_url: null };
const VENUE = { id: "v1", name: "NTU Hall", city: "Taipei", map_url: GOOD[0] };

test("★ 只收 Google 地圖的連結：後台、對外頁、資料庫三份是同一條規則", () => {
  for (const u of GOOD) { assert.ok(F.evMapOk(u), `後台該收：${u}`); assert.equal(P.mapUrl({ map_url: u }), u, `對外頁該印：${u}`); }
  for (const u of BAD) { assert.ok(!F.evMapOk(u), `後台不該收：${u}`); assert.equal(P.mapUrl({ map_url: u }), "", `對外頁不該印：${u}`); }
  assert.ok(F.evMapOk("") && F.evMapOk(null) && F.evMapOk("   "), "空的算可以（就是沒有連結）");
  assert.equal(P.mapUrl(null), ""); assert.equal(P.mapUrl({}), ""); assert.equal(P.mapUrl({ map_url: 42 }), "");
  assert.equal(String(F.EV_MAP_RE), String(P.MAP_RE), "兩份 regex 一個字都不能差（events/ 不 import 後台的檔，所以是抄的）");
  // 資料庫那一條：同樣的五種開頭、同樣的長度
  const db = /p ~ '\^https:\/\/\(([^']+?)\)\[\^/.exec(sql);
  assert.ok(db, "遷移檔裡找得到那一條");
  assert.equal(db[1], String.raw`maps\.app\.goo\.gl/|goo\.gl/maps/|(www\.)?google\.com(\.tw)?/maps[/?]|maps\.google\.com(\.tw)?/`);
  const js = /\^https:\\\/\\\/\((.+?)\)\[\^/.exec(String(F.EV_MAP_RE));
  assert.equal(js[1].replace(/\\\//g, "/"), db[1], "後台那一條的網域清單跟資料庫的一樣");
  assert.match(sql, /length\(p\) <= 600/); assert.match(read("admin/src/ui.js"), /v\.length <= 600 && EV_MAP_RE\.test\(v\)/); assert.match(read("events/src/ui.js"), /u\.length <= 600 && MAP_RE\.test\(u\)/);
});

test("★ 後台「時間與地點」：地點底下多一格，自己存；有連結多一顆「在 Google 地圖上打開」；遷移檔沒跑不畫", () => {
  const h = F.eventMapHTML(EV, null, true, false);
  assert.match(h, /<label class="wide"><i>Google 地圖連結<\/i><input id="ev-map" type="url" inputmode="url" data-noauto="1" data-id="e1" value="" maxlength="600"/, "data-noauto：整頁那條「改了就存」不碰這一格");
  assert.match(h, /到 Google 地圖找到地點，按「分享」/); assert.doesNotMatch(h, /ev-map-acts|ev-map-venue/, "沒有連結、也沒有場地：沒有按鈕");
  const has = F.eventMapHTML({ ...EV, map_url: GOOD[0] }, null, true, false);
  assert.match(has, new RegExp(`value="${GOOD[0].replace(/[.?/]/g, "\\$&")}"`));
  assert.match(has, new RegExp(`<a class="btn ghost sm" href="${GOOD[0].replace(/[.?/]/g, "\\$&")}" target="_blank" rel="noopener">在 Google 地圖上打開</a>`));
  assert.doesNotMatch(F.eventMapHTML({ ...EV, map_url: "https://example.com/x" }, null, true, false), /<a /, "打錯的（還沒存成的）不變成可以點的連結");
  // 遷移檔還沒跑：那一列沒有 map_url 這個鍵
  const { map_url, ...old } = EV;
  assert.equal(F.eventMapHTML(old, VENUE, true, false), ""); assert.equal(F.evHasMap(old), false); assert.equal(F.evHasMap(EV), true);
  // 唯讀：有連結只有一條可以點的，沒有連結什麼都沒有
  assert.equal(F.eventMapHTML(EV, null, false, false), "");
  const ro = F.eventMapHTML({ ...EV, map_url: GOOD[0] }, null, false, false);
  assert.match(ro, /在 Google 地圖上打開/); assert.doesNotMatch(ro, /<input|ev-map-venue/);
  // 整頁：那一格在「時間與地點」那一塊裡、地點的後面；readEvent 不讀它
  const page = F.eventEditHTML({ ...EV, usual_month: null, recurring: false, edition_zh: "", edition_en: "" }, null, 0, DIR, "", false, [VENUE], [], null, null, [], { photos: [], speakers: [], tickets: [] });
  const when = page.slice(page.indexOf('id="ev-when"'), page.indexOf('id="ev-place-box"'));
  assert.ok(when.indexOf('id="ev-place"') > 0 && when.indexOf('id="ev-place"') < when.indexOf('id="ev-map"'), "在地點那一格的後面");
  assert.equal(count(page, /id="ev-map"/g), 1);
  const m = read("admin/src/main.js"), fn = m.slice(m.indexOf("function readEvent() {"), m.indexOf("return patch;", m.indexOf("function readEvent() {")));
  assert.doesNotMatch(fn, /ev-map|map_url/, "readEvent 不讀這一格：它有自己的函式，不在 save_event 的 patch 裡");
  assert.match(m, /if \(S\.view === "event" && e\.target && e\.target\.id === "ev-map"\) \{ await saveEventMap\(e\.target\.dataset\.id, e\.target\.value\); return; \}/);
  assert.match(m, /if \(!UI\.evMapOk\(v\)\) \{ ev\.map_url = v; S\.msg = T\("err\.evMap"\) \+ D\.says\("bad_map_url"\); render\(\); return; \}/, "不是 Google 地圖的先在畫面擋一次，打的字留著");
  assert.match(m, /const saved = await D\.setEventMapUrl\(eventId, v\); ev\.map_url = saved \|\| null;/);
});

test("★ 場地有連結、活動還沒有：一顆「用場地的連結」，按了才抄；活動已經有自己的就沒有那一顆", () => {
  const h = F.eventMapHTML({ ...EV, venue_id: "v1" }, VENUE, true, false);
  assert.match(h, /<button type="button" class="btn ghost sm" data-act="ev-map-venue" data-id="e1">用「NTU Hall」的地圖連結<\/button>/);
  assert.match(h, /id="ev-map"[^>]* value=""/, "那一格還是空的：沒有自己抄過來");
  assert.doesNotMatch(F.eventMapHTML({ ...EV, venue_id: "v1", map_url: GOOD[1] }, VENUE, true, false), /ev-map-venue/);
  assert.doesNotMatch(F.eventMapHTML({ ...EV, venue_id: "v1" }, { ...VENUE, map_url: "" }, true, false), /ev-map-venue/, "場地沒有連結就沒有那一顆");
  assert.doesNotMatch(F.eventMapHTML({ ...EV, venue_id: "v1" }, { ...VENUE, map_url: "https://example.com/x" }, true, false), /ev-map-venue/, "場地的連結不是 Google 地圖的也沒有");
  assert.match(F.eventMapHTML({ ...EV, venue_id: "v1" }, { ...VENUE, name: '<b>x</b>' }, true, false), /用「&lt;b&gt;x&lt;\/b&gt;」的地圖連結/, "場地的名字不會變成 HTML");
  const m = read("admin/src/main.js");
  assert.match(m, /if \(act === "ev-map-venue"\) \{[\s\S]{0,260}if \(ev && vn && vn\.map_url\) await saveEventMap\(ev\.id, vn\.map_url\);/);
  // 活動頁上場地那一塊：場地有連結就多一顆可以點開
  const box = F.eventVenueHTML({ ...EV, venue_id: "v1" }, [VENUE], true, false);
  assert.match(box, new RegExp(`href="${GOOD[0].replace(/[.?/]/g, "\\$&")}" target="_blank" rel="noopener">在 Google 地圖上打開</a>`));
  assert.doesNotMatch(F.eventVenueHTML({ ...EV, venue_id: "v1" }, [{ ...VENUE, map_url: "" }], true, false), /在 Google 地圖上打開/);
});

test("★ 場地頁：多一格 Google 地圖連結（遷移檔跑過才有）；唯讀的人看到一條可以點的；原本那一格改叫「網站」", () => {
  const ed = F.venueHTML({ can_edit: true, venue: { id: "v1", name: "NTU Hall", kind: "university", city: "Taipei", map_url: GOOD[0] }, contacts: [], events: [] }, "", false, false);
  assert.match(ed, new RegExp(`<label class="wide"><i>Google 地圖連結</i><input id="vn-ed-map" type="url" inputmode="url" value="${GOOD[0].replace(/[.?/]/g, "\\$&")}" maxlength="600"`));
  assert.match(ed, /只有幹部看得到。/);
  assert.match(ed, /<i>網站<\/i><input id="vn-ed-url"/, "原本叫「網站或地圖連結」的那一格現在只是網站");
  const old = F.venueHTML({ can_edit: true, venue: { id: "v1", name: "NTU Hall", kind: "university", city: "Taipei" }, contacts: [], events: [] }, "", false, false);
  assert.doesNotMatch(old, /vn-ed-map/, "遷移檔還沒跑（那一列沒有 map_url）：不畫那一格");
  const ro = F.venueHTML({ can_edit: false, venue: { id: "v1", name: "NTU Hall", kind: "university", city: "Taipei", map_url: GOOD[0] }, contacts: [], events: [] }, "", false, false);
  assert.match(ro, /<dt>Google 地圖連結<\/dt><dd><a href="[^"]+" target="_blank" rel="noopener">在 Google 地圖上打開<\/a><\/dd>/);
  // 加一個場地：清單回了 has_map 才有那一格
  assert.match(F.venuesListHTML({ can_edit: true, has_map: true, venues: [] }, "", "", false, true), /id="vn-new-map"/);
  assert.doesNotMatch(F.venuesListHTML({ can_edit: true, venues: [] }, "", "", false, true), /id="vn-new-map"/);
  const m = read("admin/src/main.js");
  assert.match(m, /if \(document\.getElementById\(idp \+ "-map"\)\) p\.map_url = val\("map"\);/, "那一格有畫出來才帶 map_url");
  assert.equal(count(m, /if \(!UI\.evMapOk\(p\.map_url\)\) \{ S\.msg = T\("err\.vnSave"\) \+ D\.says\("bad_map_url"\);/g), 2, "加場地與改場地都先擋一次");
});

test("★ 對外的活動頁：地點後面一條「在 Google 地圖上看」；沒有連結跟以前一模一樣；怪的連結不印", () => {
  const e = { place: "Taipei Main Station" };
  assert.equal(P.placeHTML(e, null, "en"), "<li><b>Place</b><span>Taipei Main Station</span></li>", "沒有 extras（還沒跑遷移檔、載不到）：跟以前一樣");
  assert.equal(P.placeHTML(e, { map_url: null }, "zh"), "<li><b>地點</b><span>Taipei Main Station</span></li>");
  assert.equal(P.placeHTML(e, { map_url: GOOD[0] }, "zh"),
    `<li><b>地點</b><span>Taipei Main Station <a class="ev-map" href="${GOOD[0]}" target="_blank" rel="noopener">在 Google 地圖上看</a></span></li>`);
  assert.match(P.placeHTML(e, { map_url: GOOD[2] }, "en"), />Open in Google Maps<\/a>/);
  assert.equal(P.placeHTML({ place: "" }, { map_url: GOOD[0] }, "en"), `<li><b>Place</b><span><a class="ev-map" href="${GOOD[0]}" target="_blank" rel="noopener">Open in Google Maps</a></span></li>`, "沒有地點的字但有連結：那一行照樣印");
  assert.equal(P.placeHTML({ place: "" }, null, "en"), "", "兩樣都沒有就沒有那一行");
  for (const u of BAD) assert.doesNotMatch(P.placeHTML(e, { map_url: u }, "en"), /<a /, `不該印成連結：${u}`);
  assert.match(P.placeHTML({ place: '<img src=x onerror=1>' }, { map_url: GOOD[0] }, "en"), /&lt;img src=x onerror=1&gt;/);
  // 整頁：那一行在卡片的「地點」
  const page = P.detailHTML({ slug: "winter", team: "Curriculum Team", title_zh: "冬令營", title_en: "Winter", place: "Taipei", starts_at: "2027-01-03T01:00:00Z" }, "en", { photos: [], speakers: [], tickets: [], map_url: GOOD[0] }, { url: "https://x/#winter" });
  assert.equal(count(page, /class="ev-map"/g), 1); assert.match(page, /<li><b>Place<\/b><span>Taipei <a class="ev-map"/);
  assert.match(read("events/index.html"), /\.rows \.ev-map\{display:block;/);
  // 卡片（清單、首頁、現在開放）整張是一條連結，裡面不能再放一條：那幾個地方不印地圖連結
  assert.doesNotMatch(read("events/src/ui.js").replace(/export function placeHTML[\s\S]*?\n}\n/, ""), /class="ev-map"/, "只有一場活動那一頁印");
});

test("★ 遷移檔：誰存得了、對外回什麼、場地的連結不對外；資料層叫的名字與退路", () => {
  assert.match(sql, /alter table public\.events add column if not exists map_url text;/); assert.match(sql, /alter table public\.venues add column if not exists map_url text not null default '';/);
  assert.match(sql, /add constraint events_map_url_ok check \(public\.map_url_ok\(map_url\)\)/); assert.match(sql, /add constraint venues_map_url_ok check \(public\.map_url_ok\(map_url\)\)/);
  const fnOf = name => { const a = sql.indexOf(`create or replace function public.${name}(`); assert.ok(a >= 0, `找不到 ${name}`); return sql.slice(a, sql.indexOf("$$;", a) < 0 ? sql.indexOf("end $$;", a) : Math.min(...[sql.indexOf("\n$$;", a), sql.indexOf("end $$;", a)].filter(x => x > 0))); };
  const set = fnOf("set_event_map_url");
  assert.match(set, /if not public\.can_edit\(e\.workspace_id\) then raise exception 'not_event_editor'/, "門跟其他改活動的函式一樣：這場活動「改」以上");
  assert.match(set, /if not public\.map_url_ok\(v_url\) then raise exception 'bad_map_url'/); assert.match(set, /nullif\(trim\(coalesce\(p_url, ''\)\), ''\)/, "空的就是拿掉");
  assert.match(sql, /revoke all on function public\.set_event_map_url\(uuid, text\) from public, anon;\s*grant execute on function public\.set_event_map_url\(uuid, text\) to authenticated;/);
  const ex = fnOf("public_event_extras");
  assert.match(ex, /'map_url', e\.map_url\)/); assert.match(ex, /where e\.slug = p_slug and e\.status = 'published'/, "上架了才回");
  assert.match(ex, /where p\.event_id = e\.id and p\.consent\)/); assert.match(ex, /where s\.event_id = e\.id and s\.consent\)/);
  assert.doesNotMatch(ex, /venues|venue_id/, "對外那一支不讀場地：場地的連結不會自己跑到對外頁");
  const vs = fnOf("venue_save");
  assert.match(vs, /if not public\.venue_can_edit\(\) then raise exception 'not_venue_editor'/); assert.match(vs, /if p \? 'map_url' and not public\.map_url_ok\(/);
  assert.match(vs, /map_url  = case when p \? 'map_url' then trim\(coalesce\(p->>'map_url', ''\)\) else map_url end,/, "沒帶這個鍵就不動它");
  // 跟原本那一版比，venue_save 只多了 map_url 那幾行
  const orig = read("supabase/migrations/2026-12-14-venues.sql"), a0 = orig.indexOf("create or replace function public.venue_save("), origFn = orig.slice(a0, orig.indexOf("end $$;", a0));
  const flat = t => t.replace(/\s+/g, " ").trim();
  const without = vs
    .replace(/\n[^\n]*if p \? 'map_url' and not public\.map_url_ok[^\n]*/, "")
    .replace(", notes, map_url, created_by)", ", notes, created_by)")
    .replace(", coalesce(p->>'notes', ''), trim(coalesce(p->>'map_url', '')), auth.uid())", ", coalesce(p->>'notes', ''), auth.uid())")
    .replace(/\n[^\n]*map_url  = case when p \? 'map_url'[^\n]*/, "");
  assert.doesNotMatch(without, /map_url/, "上面四處拿掉之後不該還有 map_url");
  assert.equal(flat(without), flat(origFn), "venue_save 除了 map_url 那四處之外一個字都沒改");
  assert.match(fnOf("venues_list"), /if not public\.is_cadre\(\) then raise exception 'not_cadre'/); assert.match(fnOf("venues_list"), /'has_map', true,/);
  assert.match(sql, /select 0 ord, 'OVERALL' as 項目/, "最後有驗收表");
  // 資料層
  const d = read("admin/src/data.js");
  assert.match(d, /rpcV\("set_event_map_url", \{ p_event: eventId, p_url: url \|\| null \}\)/);
  assert.match(d, /let \{ data, error \} = await q\(EV_COLS \+ ", " \+ EV_PROGRAMME_COLS \+ ", " \+ EV_MAP_COLS\);\s*if \(error && String\(error\.code\) === "42703"\) \(\{ data, error \} = await q\(EV_COLS \+ ", " \+ EV_PROGRAMME_COLS\)\);\s*if \(error && String\(error\.code\) === "42703"\) \(\{ data, error \} = await q\(EV_COLS\)\);/,
    "遷移檔還沒跑（沒有那一欄）退一步不帶它讀，活動清單不會整個壞掉");
  assert.ok(d.indexOf('["bad_map_url"') > 0 && d.indexOf('["set_event_map_url"') < d.indexOf('["Could not find the function"'), "錯誤講人話，而且排在通用那一句前面");
  assert.match(read("scripts/db/smoke.sh"), /MLM=supabase\/migrations\/2027-01-05-map-links\.sql/, "smoke.sh 有跑這一支（它的清單是寫死的，新增遷移檔要自己加）");
});

test("這一批新的字中英都有、沒有破折號、沒有 emoji", () => {
  const keys = ["ev.map", "ev.mapHelp", "ev.mapOpen", "ev.mapFromVenue", "msg.evMapSaved", "msg.evMapCleared", "err.evMap", "vn.map", "vn.mapHelp", "vn.url"];
  for (const k of keys) {
    assert.ok(STRINGS[k] && STRINGS[k].zh && STRINGS[k].en, `字典裡沒有 ${k} 或少一種語言`);
    for (const lg of ["zh", "en"]) { assert.doesNotMatch(STRINGS[k][lg], /[—–]/, `${k} 有破折號`); assert.doesNotMatch(STRINGS[k][lg], /\p{Extended_Pictographic}/u, `${k} 有 emoji`); }
  }
  const src = read("admin/src/ui.js") + read("admin/src/main.js");
  for (const k of [...src.matchAll(/T\("((?:ev\.map|vn\.map|msg\.evMap|err\.evMap)[A-Za-z.]*)"/g)].map(m => m[1])) assert.ok(STRINGS[k], `程式裡用到 ${k}，字典裡沒有`);
});
