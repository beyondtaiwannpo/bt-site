// 一個人在哪幾屆做過事：在他的頁面上加、屆別那一頁加、記是哪一季（2026-11-26）。跑法：node --test test/*.test.mjs
// Paul：「people that is labeled as alumni, we don't get to just choose people and add them into terms. For example, if Andrea works in
//   2025 6, spring, I should be able to in her page add them into that term, or in terms add people into that… they should appear on that term,
//   and that terms should be connected to the front of the page where in things that says 2025 to 2026 alumni」
// 他選的：屆別照舊一年一屆，另外記是哪一季；舊資料庫寫了哪一期當 Board、而且那一屆已經結束的，自動變成那一屆的一筆紀錄（這一屆的不放）。
// 這一支守五件事：
//   1. 遷移檔：哪一季只是記錄；加、改的門沒有變寬；這一屆的不放；學員的「現在還在念高中」不碰。
//   2. 哪一期對到哪一屆：F 是那一年開始的那一屆，S 是前一年開始的那一屆。
//   3. 紀錄裡一個人的頁面：有紀錄就印、管得了的人才有按鈕、那一支還沒跑就照舊只印字。
//   4. 屆別那一頁：每一屆看得到有誰、可以從名單挑人加。
//   5. 職位空著就是幹部／Member，兩個資料夾同一條規則。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "../admin/records/src/ui.js";
import * as P from "../admin/people/src/ui.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const sql = read("supabase/migrations/2027-01-17-term-seasons.sql").replace(/--[^\n]*/g, "");

test("★ 遷移檔：哪一季只收三種；改的門是 require_senior；讀的門是 rc_can_view；沒登入叫不到", () => {
  assert.match(sql, /check \(season is null or season in \('fall', 'spring', 'summer'\)\)/);
  const season = sql.slice(sql.indexOf("function public.set_position_season"), sql.indexOf("function public.person_terms"));
  assert.match(season, /begin\s+perform public\.require_senior\(\);/, "第一句就是門");
  assert.match(season, /raise exception 'bad_season'/); assert.match(season, /raise exception 'no_such_position'/);
  assert.match(sql, /revoke all on function public\.set_position_season\(uuid, text, text, text\) from public, anon;/);
  const terms = sql.slice(sql.indexOf("function public.person_terms"), sql.indexOf("do $$"));
  assert.match(terms, /select case when public\.rc_can_view\(\) then jsonb_build_object\(/);
  assert.match(terms, /else null end;/);
  assert.match(terms, /'can_edit', public\.is_senior\(\)/, "畫不畫按鈕照資料庫的答案");
  assert.doesNotMatch(terms, /email/);
  assert.match(sql, /revoke all on function public\.person_terms\(uuid\) from public, anon;/);
  assert.doesNotMatch(sql, /create or replace function public\.(set_position|delete_position|import_positions|roster|public_team|public_past_team|rc_person)\(/, "原本那幾支一支都不重寫");
});

test("★ 遷移檔：舊資料庫的 Board 只放已經結束的那幾屆；這一屆與沒寫哪一期的不動；拿掉的標籤留在紀錄裡", () => {
  const blk = sql.slice(sql.indexOf("do $$"), sql.indexOf("function public.positions_guest_to_member_trg"));
  assert.match(blk, /g\.label = 'member' and p\.forgotten_at is null and g\.detail ~ '\^Old database: Board: \[FS\]\[0-9\]\{2\}\(;\.\*\)\?\$'/, "只認只寫了一期的那種");
  assert.match(blk, /if not exists \(select 1 from public\.terms t where t\.id = v_term and t\.status = 'ended'\) then continue; end if;/, "這一屆的不放");
  assert.match(blk, /if not exists \(select 1 from public\.positions po where po\.person_id = r\.person_id and po\.term_id = v_term\) then/, "那一屆已經有職位就不多一筆");
  assert.match(blk, /values \(r\.person_id, v_term, '幹部', 'Member', null, case when r\.m\[1\] = 'F' then 'fall' else 'spring' end\)/);
  assert.match(blk, /perform public\.rc_log_it\('label_remove', r\.person_id,/, "拿掉的標籤寫進紀錄，還原得回來");
  assert.doesNotMatch(blk, /term not recorded/, "沒寫哪一期的不碰");
});

test("哪一期對到哪一屆：F23 與 S24 都是 2023-24；F99 是 2099-00", () => {
  // 跟遷移檔同一條算式（那一段是 SQL，這裡照抄成 JS 對幾個值；算式本身用字串比對釘住）
  assert.match(sql, /case when r\.m\[1\] = 'F' then \(2000 \+ r\.m\[2\]::int\)::text \|\| '-' \|\| lpad\(\(\(r\.m\[2\]::int \+ 1\) % 100\)::text, 2, '0'\)\s+else \(2000 \+ r\.m\[2\]::int - 1\)::text \|\| '-' \|\| r\.m\[2\] end/);
  const term = code => { const f = code[0] === "F", yy = Number(code.slice(1)); return f ? `${2000 + yy}-${String((yy + 1) % 100).padStart(2, "0")}` : `${2000 + yy - 1}-${code.slice(1)}`; };
  assert.equal(term("F23"), "2023-24"); assert.equal(term("S24"), "2023-24"); assert.equal(term("F22"), "2022-23"); assert.equal(term("S26"), "2025-26");
  assert.equal(term("F26"), "2026-27"); assert.equal(term("F99"), "2099-00"); assert.equal(term("S21"), "2020-21");
});

test("★ 遷移檔：有職位的來賓算成員，學員那一格不碰", () => {
  const trg = sql.slice(sql.indexOf("function public.positions_guest_to_member_trg"), sql.indexOf("commit;"));
  assert.match(trg, /update public\.people set kind = 'member' where id = new\.person_id and kind = 'guest';/);
  assert.match(trg, /create trigger positions_guest_to_member after insert on public\.positions/);
  assert.match(trg, /where p\.kind = 'guest' and p\.forgotten_at is null and exists \(select 1 from public\.positions po where po\.person_id = p\.id\);/);
  assert.doesNotMatch(trg, /student/, "「現在還在念高中」那一格只有人自己取消");
  assert.match(read("scripts/db/smoke.sh"), /TSM=supabase\/migrations\/2027-01-17-term-seasons\.sql/, "smoke.sh 有跑這一支");
});

test("★ 紀錄裡一個人的頁面：有紀錄就印；管得了才有按鈕；那一支還沒跑照舊只印字", () => {
  const person = { person: { id: "p1", kind: "member" }, positions: [{ term: "2023-24", title_en: "Member", title_zh: "幹部", team: null }] };
  const pt = { can_edit: true, terms: [{ id: "2026-27", status: "current" }, { id: "2025-26", status: "ended" }], teams: ["Curriculum Team"],
    positions: [{ term: "2025-26", team: "Curriculum Team", title_en: "Director", title_zh: "Director", season: "spring" }, { term: "2023-24", team: null, title_en: "Member", title_zh: "幹部", season: null }] };
  const h = R.personTermsHTML(person, { personTerms: pt, busy: false });
  assert.match(h, /id="rc-terms"/);
  assert.match(h, /<b>2025-26<\/b> <span class="tag draft">/, "有寫哪一季的印出來");
  assert.equal((h.match(/data-act="pterm-del"/g) || []).length, 2, "每一筆一顆拿掉");
  assert.match(h, /data-act="pterm-del" data-term="2025-26" data-team="Curriculum Team"/);
  assert.match(h, /<select data-ptseason data-term="2023-24" data-team="">/, "沒有 team 的那一筆 data-team 是空的");
  assert.match(h, /data-act="pterm-add"/); assert.match(h, /<option value="Curriculum Team">/);
  assert.match(h, /<option value="2025-26" selected>/, "預設選最近一個已經結束的屆，不是這一屆");
  // 只有看的人：字都在，按鈕一顆都沒有
  const ro = R.personTermsHTML(person, { personTerms: { ...pt, can_edit: false }, busy: false });
  assert.match(ro, /2025-26/); assert.doesNotMatch(ro, /data-act="pterm-|data-ptseason/);
  // 那一支遷移檔還沒跑：照 rc_person 給的那幾行印，沒有按鈕；一筆都沒有就整塊不畫
  const old = R.personTermsHTML(person, { personTerms: null });
  assert.match(old, /2023-24/); assert.doesNotMatch(old, /data-act="pterm-|data-ptseason/);
  assert.equal(R.personTermsHTML({ person: {}, positions: [] }, { personTerms: null }), "");
  // 被移除的人沒有按鈕
  assert.doesNotMatch(R.personTermsHTML({ person: { forgotten_at: "2026-01-01" }, positions: [] }, { personTerms: pt }), /data-act="pterm-add"/);
  // 還勾著「現在還在念高中」的人：講一聲他不會出現在名單上
  assert.match(R.personTermsHTML({ person: { kind: "student" } }, { personTerms: pt }), /class="note"/);
  assert.doesNotMatch(h, /class="note"/);
});

test("職位空著就是幹部／Member；自己打的字兩邊同一個；兩個資料夾同一條規則", () => {
  for (const f of [R.termTitles, P.termAddTitles]) {
    assert.deepEqual(f(""), { zh: "幹部", en: "Member" }); assert.deepEqual(f("  member "), { zh: "幹部", en: "Member" });
    assert.deepEqual(f(" Director "), { zh: "Director", en: "Director" });
    assert.equal(f("x".repeat(80)).en.length, 60);
  }
  assert.deepEqual(R.SEASONS, P.TERM_SEASONS);
  assert.deepEqual(R.SEASONS, ["", "fall", "spring", "summer"]);
});

test("★ 主程式：加、改季、拿掉都走原本那幾支；存完名錄標成舊了", () => {
  const m = read("admin/records/src/main.js"), d = read("admin/records/src/data.js");
  assert.match(d, /export const setPosition = \(person, term, zh, en, team\) => rpc\("set_position",/);
  assert.match(d, /export const deletePosition = \(person, term, team\) => rpc\("delete_position",/);
  assert.match(d, /export const loadPersonTerms = id => rpc\("person_terms", \{ p_person: id \}\)\.catch\(e => \{ if \(\/person_terms\/\.test\(/, "那一支還沒跑就回 null，不讓整頁打不開");
  assert.match(m, /if \(act === "pterm-add"\) \{[\s\S]*?await D\.setPosition\(S\.id, v\.term, t\.zh, t\.en, v\.team\);[\s\S]*?if \(v\.season\) await D\.setPositionSeason\(S\.id, v\.term, v\.team, v\.season\);/);
  assert.match(m, /if \(act === "pterm-del"\) \{\s*if \(UI\.needAsk\(S, b, T\("pt\.removeAsk"\)\)\) return;/, "拿掉要再按一次");
  assert.match(m, /S\.dirStale = true; await loadPerson\(\); S\.msg = T\("msg\.ptAdded"/);
  assert.match(m, /e\.target\.closest\("select\[data-ptseason\]"\)/);
});

test("★ 屆別那一頁：每一屆看得到有誰、可以挑名單上的人加進去、可以拿掉", () => {
  const TERMS = [{ id: "2026-27", status: "current", starts_on: "2026-08-01", ends_on: "2027-07-31" }, { id: "2025-26", status: "ended", starts_on: "2025-08-01", ends_on: "2026-07-31" }];
  const PEOPLE = [
    { person_id: "a1", profile_id: "u1", name_en: "Ann", name_zh: "", role: "cadre", positions: [{ term: "2026-27", title_en: "Director", team: "Curriculum Team" }] },
    { person_id: "b2", profile_id: null, name_en: "Bob", name_zh: "", positions: [{ term: "2025-26", title_en: "Member", team: null }] },
    { person_id: "c3", profile_id: null, name_en: "Cat", name_zh: "", positions: [] }];
  const h = P.termsHTML(TERMS, PEOPLE, "u1", true, "", false, null, null);
  const fold = id => { const i = h.indexOf(`id="tm-ppl-${id}"`); return h.slice(i, h.indexOf("</details>", i)); };
  assert.match(fold("2025-26"), /<b>Bob<\/b>/); assert.doesNotMatch(fold("2025-26").split("tm-addp")[0], /Ann|Cat/, "那一屆的名單只有那一屆的人");
  assert.match(fold("2025-26"), /data-act="term-drop-person" data-term="2025-26" data-person="b2" data-team=""/);
  assert.match(fold("2025-26"), /href="#person=b2"/, "點名字到他在人與權限的那一頁");
  const add = fold("2025-26").split("tm-addp")[1];
  assert.match(add, /<option value="a1">Ann<\/option>/); assert.match(add, /<option value="c3">Cat<\/option>/); assert.doesNotMatch(add, /<option value="b2">/, "已經在那一屆的人不在選單裡");
  assert.match(add, /id="tma-season-2025-26"/); assert.match(add, /data-act="term-add-person" data-term="2025-26"/);
  const m = read("admin/people/src/main.js");
  assert.match(m, /if \(act === "term-add-person"\) \{[\s\S]*?D\.setPosition\(who, term, t\.zh, t\.en, team\)/);
  assert.match(m, /if \(season\) \{ try \{ await D\.setPositionSeason\(who, term, team, season\); \} catch \(e\) \{ msg = T\("msg\.seasonLater"\); \} \}/, "那一支還沒跑的話人還是加得進去，講一聲那一季沒存到");
  assert.match(m, /if \(act === "term-drop-person"\) \{[\s\S]*?if \(UI\.needAsk\(S, b, T\("tm\.dropAsk"/);
});
