// 標籤的兩條規則（2026-11-26）。跑法：node --test test/*.test.mjs
// Paul（看著名錄）：
//   「I don't think Edison… was never a member, so he shouldn't be labeled as alumni. Speaker doesn't count as alumni.
//     We're talking about like people who used to work in one of the team.」
//   「What does past participant mean?… if they were a student participating in our events, they should be a student」
//   「a lot of student they attended event before and now they are definitely in the age of university」
// 這一支守四件事：
//   1. 「幹部」只有三個來源（職位、幹部或校友的帳號、BT 給的標籤），people.kind 是 member 不算；只有 BT 給的算校友不算現任。
//   2. 沒寫畢業年、三個學年以前來過的學員算「以前的學員」，而且只改標籤，不改「現在還在念高中」那一格。
//   3. 規則有兩份（一個人的那一頁、名錄），兩份都要有同一條，驗收表逐人對。
//   4. 畫面上那個 chip 英文叫 Former student，兩個後台資料夾同一個字。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const sql = read("supabase/migrations/2027-01-16-member-label-rule.sql").replace(/--[^\n]*/g, "");
const of = sql.slice(sql.indexOf("function public.rc_labels_of(p_person uuid)"), sql.indexOf("function public.rc_label_codes_all()"));
const all = sql.slice(sql.indexOf("function public.rc_label_codes_all()"), sql.indexOf("commit;"));

test("★ 幹部：kind 是 member 不算；只有 BT 給的標籤的人是校友不是現任（兩份規則都是）", () => {
  assert.doesNotMatch(of, /kind = 'member'/, "一個人的那一頁");
  assert.doesNotMatch(all, /kind = 'member'/, "名錄");
  assert.match(of, /where exists \(select 1 from pos\) or \(select acct in \('cadre', 'alumni'\) from pe\)/);
  assert.match(all, /\('member',\s+pos\.person_id is not null or coalesce\(pe\.acct in \('cadre', 'alumni'\), false\),/);
  assert.match(of, /when o\.label = 'member' and e\.label is null then coalesce\(g\.until >= cur\.y, false\)/);
  assert.match(all, /when e\.label = 'member' and not e\.has then coalesce\(g\.until_year >= cur\.y, false\)/);
  // 那一條要排在「BT 寫了到哪一年」與「只有 BT 給的當成現在還是」前面，不然輪不到它
  assert.ok(of.indexOf("when o.label = 'member' and e.label is null") < of.indexOf("when g.until is not null then"), "順序");
  assert.ok(all.indexOf("when e.label = 'member' and not e.has") < all.indexOf("when g.until_year is not null then"), "順序");
});

test("★ 學員：沒寫畢業年、三個學年以前來過就算以前的；有寫畢業年的不看這一條（兩份規則都是）", () => {
  assert.match(of, /\(select \(select grad_year is null from pe\) and min\(extract\(year from \(x\.on_day - interval '7 months'\)\)::int\) \+ 3 <= cur\.sy\s+from part x where x\.role in \('student', 'mentee'\)\)/);
  assert.match(all, /and not coalesce\(e\.grad_year is null and e\.first_sy \+ 3 <= cur\.sy, false\)/);
  assert.match(all, /min\(extract\(year from \(coalesce\(e\.starts_at::date, t\.starts_on\) - interval '7 months'\)\)::int\) filter \(where x\.role in \('student', 'mentee'\)\) as first_sy/);
  assert.match(of, /coalesce\(e\.starts_at::date, \(select t\.starts_on from public\.terms t where t\.id = e\.term_id\)\) as on_day/, "沒有日期的舊活動用那一屆的第一天");
  assert.equal((sql.match(/extract\(year from \(now\(\) - interval '7 months'\)\)::int as sy/g) || []).length, 2, "學年從八月起算，兩份都是");
  // 只改算法：這一支不能動任何一列資料（特別是「現在還在念高中」那一格，那是兩道門在看的）
  assert.doesNotMatch(sql, /\b(update|delete from|insert into|alter table)\b/i, "這一支不改資料、不改表");
});

test("兩支函式都不開給前端；驗收表逐人對兩份規則", () => {
  assert.match(sql, /revoke all on function public\.rc_labels_of\(uuid\) from public, anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.rc_label_codes_all\(\) from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /grant execute/);
  assert.match(sql, /coalesce\(a\.codes, '\[\]'::jsonb\) is distinct from public\.rc_label_codes\(p\.id\)/);
  const sm = read("scripts/db/smoke.sh");
  assert.match(sm, /MLRM=supabase\/migrations\/2027-01-16-member-label-rule\.sql/, "smoke.sh 有跑這一支");
  assert.match(sm, /這一支沒有改任何一個人的 kind/);
});

test("★ 這一支照抄的兩支函式，除了那幾行以外跟原本的一模一樣", () => {
  const strip = s => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
  const o6 = read("supabase/migrations/2027-01-06-labels-and-schools.sql");
  const base = strip(o6.slice(o6.indexOf("create or replace function public.rc_labels_of(p_person uuid)"), o6.indexOf("revoke all on function public.rc_labels_of(uuid)")));
  const src = read("supabase/migrations/2027-01-16-member-label-rule.sql");
  const mine = strip(src.slice(src.indexOf("create or replace function public.rc_labels_of(p_person uuid)"), src.indexOf("revoke all on function public.rc_labels_of(uuid)")));
  const back = mine
    .replace(", extract(year from (now() - interval '7 months'))::int as sy)", ")")
    .replace(", coalesce(e.starts_at::date, (select t.starts_on from public.terms t where t.id = e.term_id)) as on_day", "")
    .replace(" and not coalesce((select (select grad_year is null from pe) and min(extract(year from (x.on_day - interval '7 months'))::int) + 3 <= cur.sy from part x where x.role in ('student', 'mentee')), false)", "")
    .replace(" when o.label = 'member' and e.label is null then coalesce(g.until >= cur.y, false)", "")
    .replace("or (select acct in ('cadre', 'alumni') from pe)", "or (select kind = 'member' or acct in ('cadre', 'alumni') from pe)");
  assert.equal(back, base, "rc_labels_of：把這一支加的那幾行拿掉，要跟 2027-01-06 那一版一字不差");
});

test("畫面：以前的學員英文叫 Former student，兩個後台資料夾同一個字", () => {
  for (const f of ["admin/records/src/strings.js", "admin/src/strings.js"]) {
    const s = read(f);
    assert.match(s, /"lab\.student\.past": \{ zh: "以前的學員", en: "Former student" \}/, f);
    assert.doesNotMatch(s, /Past participant/, f);
    assert.match(s, /"lab\.member\.past":\s+\{ zh: "校友（前幹部）", en: "Alumni \(former member\)" \}/, f);
  }
});
