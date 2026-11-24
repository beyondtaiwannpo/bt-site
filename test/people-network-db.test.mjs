// 人的關係網的資料庫那一半（2027-01-03-people-network.sql，2026-11-23）。跑法：node --test test/*.test.mjs
// 真正跑起來的行為在 scripts/db/smoke.sh 那一段（要本機的 Postgres）。這一支只讀檔，守的是「有人改遷移檔的時候不小心拿掉的門」：
//   1. 三張新表不發任何權限、沒有政策；開給沒登入的人的只有兩支。
//   2. 標籤是算的，不是填的：給得了的只有三種；people.kind 留著。
//   3. 兩個同意只有本人勾得了；高中生開不了連結；存的時候要滿 18。
//   4. 個人連結讀不到 BT 內部的關係紀錄。
//   5. 那四支「從舊版抄過來再加東西」的函式，舊的那幾句一句都沒少。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const sql = read("supabase/migrations/2027-01-03-people-network.sql");
const fn = name => { const i = sql.indexOf(`create or replace function public.${name}(`); assert.ok(i >= 0, `找不到 ${name}`); const m = /^(end \$\$;|\$\$;)\s*$/m.exec(sql.slice(i)); return sql.slice(i, i + m.index + m[0].length); };
const old = (file, name) => { const s = read("supabase/migrations/" + file); const i = s.indexOf(`create or replace function public.${name}(`); const m = /^(end \$\$;|\$\$;)\s*$/m.exec(s.slice(i)); return s.slice(i, i + m.index + m[0].length); };

test("★ 三張新表：開 RLS、收掉所有權限、沒有任何 create policy", () => {
  for (const t of ["rc_profiles", "rc_labels", "rc_profile_links"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`));
    assert.match(sql, new RegExp(`revoke all on public\\.${t} from public, anon, authenticated;`));
    assert.doesNotMatch(sql, new RegExp(`create policy \\w+ on public\\.${t}\\b`));
    assert.doesNotMatch(sql, new RegExp(`grant [a-z, ]+ on public\\.${t}\\b`));
  }
});

test("★ 開給沒登入的人的函式只有兩支；內部那幾支連登入的人都叫不到", () => {
  const anon = [...sql.matchAll(/grant execute on function ([^;]+?) to anon(?:, authenticated)?;/g)].map(m => m[1].replace(/public\.|\(.*$/g, "").trim());
  assert.deepEqual(anon.sort(), ["rc_public_profile", "rc_public_profile_save"]);
  for (const f of ["rc_labels_of(uuid)", "rc_label_codes(uuid)", "rc_profile_json(uuid, boolean)", "rc_link_person(text)", "rc_move_network(uuid, uuid)", "rc_network_forget_trg()"]) {
    assert.ok(sql.includes(`revoke all on function public.${f} from public, anon, authenticated;`), `${f} 要收掉`);
  }
});

test("★ 標籤：給得了的只有教授、招生官、聯絡人；賺來的八種從紀錄算；kind 那一欄沒有被改", () => {
  assert.match(sql, /label\s+text not null check \(label in \('professor', 'admission_officer', 'connection'\)\)/);
  assert.match(fn("rc_label_set"), /if not public\.rc_can_manage\(\) then raise exception 'not_records_manager'/);
  assert.match(fn("rc_label_set"), /if p_label not in \('professor', 'admission_officer', 'connection'\) then raise exception 'bad_label'/);
  const l = fn("rc_labels_of");
  for (const k of ["member", "intern", "student", "mentee", "mentor", "speaker", "volunteer", "organizer"]) assert.ok(l.includes(`'${k}', 'earned'`) || l.includes(`'${k}' as label, 'earned' as source`), `${k} 是賺來的`);
  assert.match(l, /from public\.event_speakers s join public\.events e on e\.id = s\.event_id where s\.person_id = p_person/, "活動頁的講者連到他就算");
  assert.doesNotMatch(sql, /alter table public\.people (add|drop|alter)/, "people 表一欄都不動（它開了 select 政策）");
  assert.doesNotMatch(sql.replace(fn("rc_move_records"), ""), /update public\.people set[^;]*\bkind\b/, "除了合併那一支（照舊版），沒有任何地方改 kind");
});

test("★ 同意只有本人勾得了；高中生開不了連結；存要滿 18、連結要對、一小時 40 次", () => {
  assert.match(fn("rc_save_profile"), /if coalesce\(\(p->>'share_profile'\)::boolean, false\) or coalesce\(\(p->>'share_story'\)::boolean, false\) then raise exception 'consent_needs_self'/);
  assert.match(fn("rc_save_profile"), /share_profile\s+= case when p \? 'share_profile' then false else share_profile end/);
  assert.match(fn("rc_profile_link"), /if pe\.kind = 'student' and \(pe\.grad_year is null or pe\.grad_year >= extract\(year from now\(\)\)::int\) then raise exception 'minor_no_link'/);
  const s = fn("rc_public_profile_save");
  assert.ok(s.indexOf("'bad_link'") < s.indexOf("'adult_only'") && s.indexOf("'adult_only'") < s.indexOf("update public.people set"), "先對連結、再問滿 18，兩個都過了才寫任何東西");
  assert.match(s, /elsif lk\.saves >= 40 then raise exception 'too_many'/);
  assert.match(s, /perform public\.rc_log_it\('profile_contact_conflict', v_person, null, jsonb_build_object\('kind', k\)\);\s*continue;/, "聯絡方式撞到別人：不寫、不講，記一筆");
  assert.match(s, /and person_id = v_person and kind in \('enrolled', 'graduated', 'working'\) and visibility <> 'private'/, "帶進來的去向 id 要是他自己的");
  assert.match(fn("rc_link_person"), /l\.revoked_at is null and l\.expires_at > now\(\) and pe\.forgotten_at is null/);
});

test("★ 個人連結讀到的東西：profile 走不含關係紀錄的那一版，整支沒有 rel_、沒有備註", () => {
  const r = fn("rc_public_profile");
  assert.match(r, /'profile', public\.rc_profile_json\(v_person, false\)/);
  assert.doesNotMatch(r, /rel_|pe\.note|rc_note_backup|'id', pe\.id/);
  assert.match(fn("rc_person"), /'profile', public\.rc_profile_json\(pe\.id, true\)/);
  assert.match(fn("rc_person"), /'token', case when public\.rc_can_manage\(\) then l\.token end/, "token 只給管的人");
});

test("★ 從舊版抄過來的四支：舊的那幾句都還在，只多不少", () => {
  const strip = s => s.replace(/\s+/g, " ");
  const mv = strip(fn("rc_move_records")), mvOld = strip(old("2026-12-11-records-merge-accounts.sql", "rc_move_records")).replace(/ end \$\$;$/, "");
  assert.ok(mv.startsWith(mvOld), "rc_move_records 前面整段跟 2026-12-11 一字不差"); assert.match(mv, /perform public\.rc_move_network\(p_keep, p_drop\); end \$\$;$/);
  const lines = (now, was) => { for (const line of was.split("\n").map(x => x.trim()).filter(x => x.length > 40)) {
    const want = line.replace("'year', o.year, 'note', o.note,", "'year', o.year, 'note', o.note, 'title', o.title,").replace("'has_account', pe.profile_id is not null) order by", "@@").replace("left join public.profiles pr on pr.id = pe.profile_id", "left join public.profiles pr on pr.id = pe.profile_id left join public.rc_profiles pf on pf.person_id = pe.id");
    if (want.includes("@@")) continue;
    assert.ok(now.includes(want), "少了一句：" + line.slice(0, 90)); } };
  lines(fn("rc_person"), old("2026-12-12-records-contacts.sql", "rc_person"));
  lines(fn("rc_directory"), old("2026-12-10-records-school-history.sql", "rc_directory"));
  lines(fn("rc_find_people"), old("2026-12-01-records.sql", "rc_find_people"));
  for (const f of ["rc_person", "rc_directory", "rc_find_people"]) assert.match(fn(f), /public\.rc_can_view\(\)/, `${f} 照舊先問看不看得到`);
});

test("忘記一個人時三張表跟著清；smoke 有跑這一支，而且有破壞測試", () => {
  assert.match(sql, /create trigger rc_network_forget after update of forgotten_at on public\.people/);
  const t = fn("rc_network_forget_trg");
  for (const x of ["rc_profiles", "rc_labels", "rc_profile_links"]) assert.ok(t.includes(`delete from public.${x} where person_id = new.id;`));
  const sm = read("scripts/db/smoke.sh");
  assert.match(sm, /NWM=supabase\/migrations\/2027-01-03-people-network\.sql/);
  assert.ok((sm.match(/破壞測試：(拿掉「要滿 18」|把 profile 表的讀取權限發給登入的人|讓個人連結讀得到關係紀錄|拿掉「高中生開不了連結」|多開一支函式給沒登入的人)/g) || []).length === 5);
});

// ── QR code（admin/records/src/qr.js）：自己寫的產生器，沒有外面的程式 ──
import { qrMatrix, qrSVG } from "../admin/records/src/qr.js";

test("QR code：一條個人連結畫得出來，三個定位圖案在、大小對；太長回 null 與空字串", () => {
  const url = "https://beyondtaiwannpo.com/profile/?t=" + "a1b2c3d4".repeat(8);
  const q = qrMatrix(url);
  assert.equal(q.size, 17 + 4 * q.version); assert.ok(q.version <= 7, "一條連結大約 103 個字，版本 6 或 7 就夠");
  const s = q.size, r = q.rows;
  for (const [cx, cy] of [[3, 3], [s - 4, 3], [3, s - 4]]) {
    assert.ok(r[cy][cx] && r[cy - 3][cx - 3] && r[cy + 3][cx + 3], "定位圖案的中心與外框是黑的");
    assert.ok(!r[cy - 2][cx - 2] && !r[cy + 2][cx + 2], "中間那一圈是白的");
  }
  for (let i = 8; i < s - 8; i++) assert.equal(r[6][i], i % 2 === 0, "時序圖案一黑一白");
  assert.ok(r[s - 8][8], "固定的那一顆黑點");
  assert.deepEqual(qrMatrix(url).rows, q.rows, "同一條連結每次畫出來都一樣");
  assert.notDeepEqual(qrMatrix(url + "x").rows, q.rows);
  assert.equal(qrMatrix("x".repeat(213)).version, 10); assert.equal(qrMatrix("x".repeat(214)), null); assert.equal(qrSVG("x".repeat(214)), "");
  const svg = qrSVG(url, { px: 260 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+" width="260" height="260"/); assert.match(svg, /fill="#fff"\/><path d="M/);
  assert.doesNotMatch(read("admin/records/src/qr.js"), /https?:\/\/(?!www\.w3\.org)|import /, "不載任何外面的東西");
});
