// 講者卡沒有自己的照片，就用他在名單（People）裡的那一張（2026-11-26）。
// Paul：「in their people, they have their profile picture, but when they're added to the events, their picture is not loaded.」他選自動。
// 資料庫那一半在 supabase/migrations/2027-01-14-speaker-people-photo.sql，真的跑在 scripts/db/smoke.sh 最後一段；這裡守字與畫面。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as FS from "../admin/src/strings.js";
import * as PUB from "../events/src/ui.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const SQL = read("supabase/migrations/2027-01-14-speaker-people-photo.sql");
const code = SQL.replace(/--[^\n]*/g, "");
const fn = name => { const a = code.indexOf("create or replace function public." + name + "("); assert.ok(a >= 0, name); return code.slice(a, code.indexOf("$$;", a) > 0 && code.indexOf("$$;", a) < code.indexOf("end $$;", a) || code.indexOf("end $$;", a) < 0 ? code.indexOf("$$;", a) : code.indexOf("end $$;", a)); };
const PEOPLE = "https://x.supabase.co/storage/v1/object/public/people/p1/1-abc.jpg";
const OWN = "https://x.supabase.co/storage/v1/object/public/events/e1/own.jpg";
const EV = { id: "e1", slug: "jan-talk", status: "draft" };

test("★ 資料庫：對外那一支，卡上的照片贏，沒有才用名單裡的；只認連到的那個人、被忘記的不帶、只收 https；其他的門一個字都沒改", () => {
  const pub = fn("public_event_extras");
  assert.match(pub, /'photo_url', coalesce\(s\.photo_url,\s*\(select ph\.photo_url from rc_profiles ph join people pp on pp\.id = ph\.person_id\s*where ph\.person_id = s\.person_id and pp\.forgotten_at is null and ph\.photo_url ~ '\^https:\/\/'\)\)\)/);
  assert.match(pub, /from event_speakers s where s\.event_id = e\.id and s\.consent\)/, "照舊只回放在對外頁的講者");
  assert.match(pub, /where e\.slug = p_slug and e\.status = 'published';/, "照舊只回上架的活動");
  assert.match(pub, /'job', case when pf\.share_profile then/); assert.match(pub, /'story', case when pf\.share_story then/);
  assert.doesNotMatch(pub, /'person_id'|'id'|email/, "對外不回 id、person_id、email");
  // 跟 2027-01-07 那一版比：拿掉照片那一格之後，其他一個字都一樣
  const strip = s => s.replace(/\s+/g, " ");
  const old = read("supabase/migrations/2027-01-07-speaker-profiles.sql").replace(/--[^\n]*/g, "");
  const oa = old.indexOf("create or replace function public.public_event_extras("), oldFn = old.slice(oa, old.indexOf("$$;", oa));
  const mine = strip(pub).replace(/'photo_url', coalesce\(s\.photo_url, \(select ph\.photo_url from rc_profiles ph join people pp on pp\.id = ph\.person_id where ph\.person_id = s\.person_id and pp\.forgotten_at is null and ph\.photo_url ~ '\^https:\/\/'\)\)\)/, "'photo_url', s.photo_url)");
  assert.equal(mine, strip(oldFn), "除了照片那一格，跟 2027-01-07 那一版一模一樣");
  assert.match(code, /revoke all on function public\.public_event_extras\(text\) from public;\s*grant execute on function public\.public_event_extras\(text\) to anon, authenticated;/);
});

test("★ 資料庫：後台那一支門沒變，多回 people_photo；只回給讀得到名單的人，或那一位已經對外", () => {
  const list = fn("event_speakers_list");
  assert.match(list, /if not public\.can_edit\(e\.workspace_id\) then raise exception 'not_event_editor'/);
  assert.match(list, /v_view := public\.rc_can_view\(\);/);
  assert.match(list, /'people_photo', case when s\.consent or v_view then\s*\(select ph\.photo_url from rc_profiles ph join people pp on pp\.id = ph\.person_id\s*where ph\.person_id = s\.person_id and pp\.forgotten_at is null and ph\.photo_url ~ '\^https:\/\/'\) end\)/);
  assert.match(list, /'id', s\.id, 'person_id', s\.person_id, 'display_name', s\.display_name, 'subject', s\.subject,\s*'school', s\.school, 'photo_url', s\.photo_url, 'consent', s\.consent, 'sort', s\.sort,/, "原本的八個鍵都還在");
  assert.match(code, /revoke all on function public\.event_speakers_list\(uuid\) from public, anon;\s*grant execute on function public\.event_speakers_list\(uuid\) to authenticated;/);
  assert.doesNotMatch(code, /create table|alter table|create policy|drop policy|storage\./, "沒有新的表、欄位、政策，沒有動 Storage");
  assert.equal((code.match(/create or replace function/g) || []).length, 2, "只重寫兩支");
  assert.match(SQL, /^begin;$/m); assert.match(SQL, /^commit;$/m); assert.match(SQL, /'OVERALL'/);
});

test("★ 後台的講者卡：沒有自己的照片就畫名單裡的那一張，下面講一句；卡上有自己的就畫自己的，講拿掉會改用名單的", () => {
  F.setLang("zh");
  const sp = (o) => ({ id: "s1", person_id: "p1", display_name: "Vicky", subject: "", school: "Cambridge", photo_url: null, people_photo: null, consent: true, sort: 10, ...o });
  const fromPeople = F.eventSpeakersHTML(EV, [sp({ people_photo: PEOPLE })], true, false, { spOpenIds: { s1: true } });
  assert.ok(fromPeople.includes(`src="${PEOPLE}"`), "收著的那一行畫名單裡的照片");
  assert.match(fromPeople, /<p class="ev-line mini ev-sp-pnote">現在用的是他在名單裡的照片，在名單換了這裡會跟著換。這一場要用別張，從上面加。<\/p>/);
  assert.match(fromPeople, /<i>加照片<\/i>/, "卡上還是沒有自己的照片，所以那一顆叫加照片"); assert.doesNotMatch(fromPeople, /ev-sp-photo-clear/, "名單的照片不是從這裡拿掉的");
  const own = F.eventSpeakersHTML(EV, [sp({ photo_url: OWN, people_photo: PEOPLE })], true, false, { spOpenIds: { s1: true } });
  assert.ok(own.includes(`src="${OWN}"`) && !own.includes(`src="${PEOPLE}"`), "卡上的贏");
  assert.match(own, /<p class="ev-line mini ev-sp-pnote">這一張是這一場自己的。拿掉它，就會改用他在名單裡的照片。<\/p>/); assert.match(own, /ev-sp-photo-clear/);
  const none = F.eventSpeakersHTML(EV, [sp({})], true, false, { spOpenIds: { s1: true } });
  assert.doesNotMatch(none, /ev-sp-pnote/, "名單裡也沒有照片：不印那一句");
  // 遷移檔還沒跑（那一列沒有 people_photo 這個鍵）、沒連到人、不是 https：都不印、不畫
  assert.equal(F.evPeoplePhotoNote({ id: "s1", person_id: "p1", photo_url: null }), "");
  assert.equal(F.evPeoplePhotoNote({ id: "s1", person_id: null, people_photo: PEOPLE }), "");
  assert.equal(F.evPeoplePhotoNote({ id: "s1", person_id: "p1", people_photo: "http://x/a.jpg" }), ""); assert.equal(F.evPeoplePhotoNote(null), "");
  assert.match(F.evPeoplePhotoNote({ person_id: "p1", people_photo: PEOPLE }), /ev-sp-pnote/);
  F.setLang("en");
  assert.match(F.evPeoplePhotoNote({ person_id: "p1", people_photo: PEOPLE }), /Showing their People photo\./); assert.match(F.evPeoplePhotoNote({ person_id: "p1", photo_url: OWN, people_photo: PEOPLE }), /Remove it to use their People photo instead\./);
  for (const k of ["ev.spPhotoFrom", "ev.spPhotoPeople", "ev.spPhotoPeopleAlso"]) { const v = FS.STRINGS[k]; assert.ok(v && v.zh && v.en, k); }
  const strings = read("admin/src/strings.js");
  assert.doesNotMatch(strings, /ev\.spPhotoDrop|msg\.evSpAddedPhoto|msg\.evSpAddedNoPhoto/, "抄照片那幾句拿掉了");
  assert.doesNotMatch(read("admin/src/main.js"), /ev-sp-nophoto|evSpAddedPhoto|evSpAddedNoPhoto/);
});

test("★ 對外頁不用改：它只認 photo_url，資料庫回哪一張就畫哪一張", () => {
  const h = PUB.speakersHTML({ speakers: [{ name: "Vicky", subject: "", school: "Cambridge", photo_url: PEOPLE }, { name: "Eva", subject: "", school: "Cornell Tech", photo_url: null }] }, "en");
  assert.ok(h.includes(`src="${PEOPLE}"`)); assert.equal((h.match(/<img /g) || []).length, 1, "沒有照片的那一位照舊只有名字的第一個字");
});
