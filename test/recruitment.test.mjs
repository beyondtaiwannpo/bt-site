// 幹部招募：搬到「人與權限」底下，錄取了就寄邀請（2026-11-26）。
// Paul：「it's recruiting for our board members… is there a better way」，他選錄取的那一下邀請碼建好、邀請信寄出去。
// 資料庫那一半在 supabase/migrations/2027-01-15-recruitment-invites.sql，真的跑在 scripts/db/smoke.sh 最後一段；這裡守字、畫面與接線。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as F from "../admin/src/ui.js";
import * as RAIL from "../shared/rail.js";
import * as P from "../admin/people/src/ui.js";

const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const SQL = read("supabase/migrations/2027-01-15-recruitment-invites.sql");
const code = SQL.replace(/--[^\n]*/g, "");
const fn = name => { const a = code.indexOf("create or replace function public." + name + "("); assert.ok(a >= 0, name); return code.slice(a, code.indexOf("end $$;", a)); };
const FORM = { id: "f1", title: "2027-28 幹部招募", team: "Marketing Team", kind: "board", status: "open", counts: { total: 2, received: 1 } };
const TERMS = [{ id: "2026-27", status: "current" }, { id: "2025-26", status: "ended" }];
const APP = { id: "a1", applicant_name: "Amy", applicant_email: "a@x.io", status: "accepted", submitted_at: "2026-10-01T00:00:00Z", answers: new Map() };
const RC = o => ({ can: true, ready: true, status: {}, set: null, terms: TERMS, teams: F.TEAM_LABELS, ...o });

test("★ 資料庫：兩支都要 senior；只認招募表與已經錄取的；職級只到 director；不直接改任何人的角色", () => {
  const inv = fn("recruit_invite"), st = fn("recruit_status");
  assert.match(inv, /begin\s+perform public\.require_senior\(\);/, "第一件事就是那道門");
  assert.match(st, /begin\s+perform public\.require_senior\(\);/);
  assert.match(inv, /if v_rank not in \('member', 'adviser', 'director'\) then raise exception 'bad_role'/);
  assert.match(inv, /if r\.kind is distinct from 'board' then raise exception 'not_recruitment'/);
  assert.match(inv, /if r\.status <> 'accepted' then[\s\S]{0,120}'not_accepted'/);
  for (const why of ["already_cadre", "invite_pending", "on_roster", "ambiguous_person", "bad_email", "no_such_application"]) assert.match(inv, new RegExp(`'why', '${why}'`), why);
  assert.match(inv, /values \(v_code, 1, 'cadre', null, v_person, v_email, v_rank, now\(\) \+ interval '30 days', auth\.uid\(\), v_lang\);\s*perform public\.queue_invite_mail\(v_code\);/);
  assert.doesNotMatch(inv, /update profiles|insert into profiles|assignments|board_role/, "角色與職級是本人用了碼才寫的（claim_invite），這一支不碰");
  assert.doesNotMatch(inv, /email_has_account/, "申請的人本來就有帳號，這一支不擋");
  assert.equal((code.match(/create or replace function/g) || []).length, 2, "只有兩支新的，原本的一支都沒重寫");
  assert.doesNotMatch(code, /create table|alter table|create policy|drop policy/);
  for (const f of ["recruit_invite(uuid[], jsonb)", "recruit_status(uuid)"]) {
    assert.ok(code.includes(`revoke all on function public.${f} from public, anon;`), f);
    assert.ok(code.includes(`grant execute on function public.${f} to authenticated;`), f);
  }
  assert.match(SQL, /^begin;$/m); assert.match(SQL, /^commit;$/m); assert.match(SQL, /'OVERALL'/);
});

test("★ 側欄：幹部招募在「人與權限」底下，各 team 那一行不在了", () => {
  const it = RAIL.ITEMS.find(i => i.group === "forms" && i.key === "forms");
  assert.deepEqual({ area: it.area, who: it.who, zh: it.label.zh, en: it.label.en }, { area: "people", who: "ws:apps", zh: "幹部招募", en: "Recruitment" });
  assert.equal(RAIL.ITEMS.find(i => i.key === "teams"), undefined);
  const pres = { role: "cadre", board: "president", senior: true, name: "a", team: "", ws: {} };
  const h = RAIL.railHTML("forms", "forms", pres, {}, "en");
  assert.match(h, /href="#forms" data-act="tab" data-t="forms"[^>]*aria-current="page">[\s\S]{0,40}Recruitment/, "在 /admin/ 這個資料夾裡，那一行是換 #");
  assert.match(RAIL.railHTML("people", "roster", pres, {}, "en"), /href="\/admin\/\?lang=en#forms"[^>]*>[\s\S]{0,40}Recruitment/, "從人與權限那個資料夾連回 /admin/#forms");
  assert.doesNotMatch(h, />Teams<|Programs &amp; recruitment/);
});

test("那六格：一開始的樣子、送給資料庫的樣子、寄完之後那一句", () => {
  assert.deepEqual(F.recruitDefaults(FORM, TERMS), { rank: "member", team: "Marketing Team", title_en: "", title_zh: "", term: "2026-27", lang: "zh" });
  assert.equal(F.recruitDefaults(FORM, []).term, ""); assert.equal(F.recruitDefaults(null, [{ id: "x", status: "ended" }]).term, "x", "沒有現在這一屆就拿最新的那一屆");
  assert.deepEqual(F.recruitPatch({ rank: "president", team: " Curriculum Team ", title_en: " Lead ", title_zh: "", term: "2026-27", lang: "fr" }),
    { rank: "member", team: "Curriculum Team", title_en: "Lead", title_zh: "", term: "2026-27", lang: "zh" }, "認不得的職級當 member（資料庫那一邊也擋），語言只有中英");
  assert.deepEqual(F.recruitPatch(null), { rank: "member", team: "", title_en: "", title_zh: "", term: "", lang: "zh" });
  F.setLang("en");
  assert.equal(F.recruitResultNote({ sent: 2, skipped: [{ id: "a", why: "on_roster" }, { id: "b", why: "on_roster" }, { id: "c", why: "zzz" }] }),
    ", 2 invites sent, 2 already on the roster (change their role from the Roster), 1 not sent");
  assert.equal(F.recruitResultNote({ sent: 0, skipped: [] }), ""); assert.equal(F.recruitResultNote(null), "");
});

test("★ 審核頁那一塊：只有招募表才有；senior 看到六格；別的審核的人看到一句；資料庫還沒跑講要跑哪一支", () => {
  F.setLang("en");
  assert.equal(F.recruitPanelHTML({ ...FORM, kind: "program" }, RC(), false), "", "不是招募表就沒有");
  assert.equal(F.recruitPanelHTML(FORM, null, false), "");
  const p = F.recruitPanelHTML(FORM, RC(), false);
  for (const k of ["rank", "team", "term", "title_en", "title_zh", "lang"]) assert.match(p, new RegExp(`data-rc="${k}"`), k);
  assert.match(p, /<option value="member" selected>/); assert.match(p, /<option value="Marketing Team" selected>Marketing<\/option>/); assert.match(p, /<option value="2026-27" selected>/);
  assert.doesNotMatch(p, /value="president"|value="senior_adviser"/, "這裡邀不了那兩個職級");
  const kept = F.recruitPanelHTML(FORM, RC({ set: { rank: "director", team: "", title_en: 'A "b"', title_zh: "組長", term: "2025-26", lang: "en" } }), false);
  assert.match(kept, /<option value="director" selected>/); assert.match(kept, /data-rc="title_en" value="A &quot;b&quot;"/); assert.match(kept, /<option value="2025-26" selected>/); assert.match(kept, /<option value="en" selected>/);
  assert.match(F.recruitPanelHTML(FORM, { can: false }, false), /A Co-President or Senior Adviser sends the invite\./); assert.doesNotMatch(F.recruitPanelHTML(FORM, { can: false }, false), /data-rc=/);
  assert.match(F.recruitPanelHTML(FORM, RC({ ready: false }), false), /run 2027-01-15-recruitment-invites\.sql/);
  // 整頁：那一塊在篩選與清單上面
  const page = F.appsHTML(FORM, [APP], [], true, new Set(), "all", [], "", false, RC({ status: { a1: "none" } }));
  assert.ok(page.indexOf('id="rc-panel"') > 0 && page.indexOf('id="rc-panel"') < page.indexOf('data-act="filter"'));
  assert.doesNotMatch(F.appsHTML({ ...FORM, kind: "program" }, [APP], [], true, new Set(), "all", [], "", false, null), /rc-panel|data-rc-state/, "別的表單照舊");
});

test("★ 每一筆錄取的申請後面的狀態；還沒寄或過期才有「寄邀請」；不是 senior 什麼都不畫", () => {
  F.setLang("en");
  const tag = st => F.recruitTagHTML(APP, RC({ status: { a1: st } }), false);
  assert.match(tag("none"), /data-rc-state="none">No invite yet<\/span> <button type="button" class="btn ghost sm" data-act="rc-invite" data-id="a1">Send invite<\/button>/);
  assert.match(tag("expired"), /Invite expired<\/span>[\s\S]*data-act="rc-invite"[^>]*>Send again</);
  for (const st of ["pending", "joined", "on_roster"]) assert.doesNotMatch(tag(st), /rc-invite/, st);
  assert.match(tag("pending"), />Invite sent</); assert.match(tag("joined"), />Joined</); assert.match(tag("on_roster"), />Already on the roster</);
  assert.equal(tag("???"), ""); assert.equal(F.recruitTagHTML({ ...APP, status: "received" }, RC({ status: { a1: "none" } }), false), "", "還沒錄取的不印");
  assert.equal(F.recruitTagHTML(APP, { can: false }, false), ""); assert.equal(F.recruitTagHTML(APP, RC({ ready: false, status: { a1: "none" } }), false), "");
  assert.match(F.recruitTagHTML(APP, RC({ status: { a1: "none" } }), true), /data-act="rc-invite" data-id="a1" disabled/);
});

test("★ main.js 的接線：招募表按錄取才接著寄邀請，而且只有 senior；邀請沒排成不蓋掉錄取；那六格改了就記著", () => {
  const m = read("admin/src/main.js");
  assert.match(m, /const recruitOn = \(\) => isRecruit\(\) && !!S\.me\.senior && S\.rcStatus !== null && S\.rcStatus !== undefined;/);
  assert.match(m, /const invite = status === "accepted" && recruitOn\(\) \? UI\.recruitPatch\(S\.rc\) : null;/, "面試、不錄取、別的表單、不是 senior、資料庫還沒跑：都不寄邀請");
  const dec = m.slice(m.indexOf('if (act === "decide") {'), m.indexOf('if (act === "rc-invite") {'));
  assert.ok(dec.indexOf("await D.decide(ids, status)") < dec.indexOf("await D.recruitInvite(ids, invite)") && dec.indexOf("await D.recruitInvite(ids, invite)") < dec.indexOf("await D.sendMail()"), "先錄取、再排邀請、最後一起寄信");
  assert.match(dec, /catch \(re\) \{ rcErr = T\("err\.rcInvite"\) \+ D\.says\(re\); \}/, "邀請那一半失敗講清楚，錄取已經做了");
  assert.match(dec, /T\("confirm\.decideInvite", \{ n: ids\.length, rank: UI\.boardName\(invite\.rank\), term: invite\.term \|\| "" \}\)/, "確認的那一句講會多寄一封邀請");
  assert.match(m, /if \(act === "rc-invite"\) \{\s*if \(!recruitOn\(\)\) return;/);
  assert.match(m, /e\.target\.dataset\.rc && S\.rc\) \{ S\.rc = Object\.assign\(\{\}, S\.rc, \{ \[e\.target\.dataset\.rc\]: e\.target\.value \}\); return; \}/);
  const d = read("admin/src/data.js");
  assert.match(d, /export const recruitInvite = \(ids, set\) => rpcV\("recruit_invite", \{ p_ids: ids, p: set \}\);/);
  assert.match(d, /rpcV\("recruit_status", \{ p_form: formId \}\)/);
});

test("幹部名單：篩了一個 team，搜尋框底下多一行人數與 Director；沒篩、篩「還沒填 team」就沒有", () => {
  P.setLang("zh");
  const terms = [{ id: "2026-27", status: "current" }];
  const person = (id, name, rank, team) => ({ person_id: id, profile_id: id, name_zh: name, name_en: "", role: "cadre", board_role: rank, team, positions: [{ term: "2026-27", title_zh: "x", title_en: "x", team }], workspaces: [] });
  const people = [person("p1", "甲", "director", "Marketing Team"), person("p2", "乙", "member", "Marketing Team"), person("p3", "丙", "member", "Curriculum Team")];
  const h = P.rosterHTML(people, terms, "p0", true, "", false, { team: "Marketing Team" }, [], null, null);
  assert.match(h, /<p class="ro-teamsum" id="ro-teamsum"><b>Marketing<\/b>：2 人。Director：甲<\/p>/);
  assert.match(P.rosterHTML(people, terms, "p0", true, "", false, { team: "Curriculum Team" }, [], null, null), /<b>Curriculum<\/b>：1 人。Director 還沒指定<\/p>/);
  assert.match(P.rosterHTML(people, terms, "p0", true, "", false, { team: "Marketing Team", q: "乙" }, [], null, null), /：2 人。/, "打字找名字不影響這個 team 的人數");
  assert.doesNotMatch(P.rosterHTML(people, terms, "p0", true, "", false, {}, [], null, null), /ro-teamsum/);
  assert.doesNotMatch(P.rosterHTML(people, terms, "p0", true, "", false, { team: "__none" }, [], null, null), /ro-teamsum/);
});
