// 很久以前來過的學員：「現在還在念高中」那一格取消（2026-11-26）。跑法：node --test test/*.test.mjs
// Paul：2027-01-16 只改了標籤，正式站有 584 個人是「標籤寫以前的學員、那一格還勾著」。講了取消會打開哪兩道門（個人連結、去向連名字公開）之後，他選「Untick them」。
// 這一支只有資料，所以守的是「動到誰、不動誰」：這一條是用來的時間推的，不是本人講的，範圍多一點就是把還在念高中的人當成大人。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const sql = read("supabase/migrations/2027-01-20-untick-aged-out-students.sql").replace(/--[^\n]*/g, "");
const blk = sql.slice(sql.indexOf("do $$"), sql.indexOf("commit;"));

test("★ 只動：學員、沒寫畢業年、沒有帳號、沒被移除、三個學年以前第一次來", () => {
  assert.match(blk, /where p\.kind = 'student' and p\.grad_year is null and p\.profile_id is null and p\.forgotten_at is null/);
  assert.match(blk, /join public\.rc_participation x on x\.person_id = p\.id and x\.role in \('student', 'mentee'\)/, "只看以學員或 mentee 的身分來的那幾場");
  assert.match(blk, /having min\(extract\(year from \(coalesce\(e\.starts_at::date, t\.starts_on\) - interval '7 months'\)\)::int\) \+ 3 <= v_sy/);
  assert.match(blk, /v_sy int := extract\(year from \(now\(\) - interval '7 months'\)\)::int/, "學年八月起算，跟標籤那一條同一個算法");
  // 跟 2027-01-16 那一條標籤規則是同一個算式（那一條決定畫面上寫不寫「以前的學員」，這一條決定那一格）
  const rule = read("supabase/migrations/2027-01-16-member-label-rule.sql");
  assert.ok(rule.includes("min(extract(year from (coalesce(e.starts_at::date, t.starts_on) - interval '7 months'))::int) filter (where x.role in ('student', 'mentee')) as first_sy"));
  assert.ok(rule.includes("e.grad_year is null and e.first_sy + 3 <= cur.sy"));
});

test("★ 做的三件事跟去向那條路一樣：改成 guest、必要時留一個學員標籤、寫一列紀錄", () => {
  assert.match(blk, /update public\.people set kind = 'guest' where id = r\.id;/);
  assert.match(blk, /if not r\.was_student then\s+insert into public\.rc_labels \(person_id, label, detail, since_year, until_year, set_by\)\s+values \(r\.id, 'student', 'Left high school \(by first event year\)', null, \(r\.first_sy \+ 3\)::smallint, null\)\s+on conflict \(person_id, label\) do nothing;/, "只當過 mentee 的人才補標籤，已經有的不蓋");
  assert.match(blk, /perform public\.rc_log_it\('left_high_school', r\.id, jsonb_build_object\('kind', 'student'\),\s+jsonb_build_object\('kind', 'guest', 'because', 'first_event', 'first_school_year', r\.first_sy,/);
  assert.equal((blk.match(/update public\.people/g) || []).length, 1, "只有這一句改人");
  assert.doesNotMatch(blk, /share_profile|share_story|consent|rc_profile_links|rc_outcomes/, "不替任何人勾同意、不開連結、不動去向");
  assert.doesNotMatch(sql, /create (or replace )?function|alter table|create policy|grant |create trigger/i, "沒有新的函式、表、政策、權限、trigger");
});

test("驗收表對得到不該動的人；smoke.sh 有跑這一支，而且驗了那道門真的開了", () => {
  assert.match(sql, /where p\.profile_id is not null\) as touched_accounts/);
  assert.match(sql, /where f\.first_sy \+ 3 > cur\.sy\) as touched_recent/);
  assert.match(sql, /coalesce\(a\.codes, '\[\]'::jsonb\) is distinct from public\.rc_label_codes\(p\.id\)/);
  const sm = read("scripts/db/smoke.sh");
  assert.match(sm, /UAM=supabase\/migrations\/2027-01-20-untick-aged-out-students\.sql/);
  assert.match(sm, /還勾著的那一位照舊開不了個人連結" "minor_no_link"/);
  assert.match(sm, /有自己帳號的學員不動/);
});
