// 登入後頁面的中英切換（2026-10-19，docs/2026-10-19-後台中英切換.md）。
// 六個資料夾各有一支 strings.js，COMMON 與機制要一模一樣；每個鍵中英都要有；
// 每個畫面用英文畫出來不能剩中文；頂欄（shared/nav.js）兩版都畫得出來。
// 跑法：node --test test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import * as ADMIN_S from "../admin/src/strings.js";
import * as SETTINGS_S from "../settings/src/strings.js";
import * as APP_S from "../app/src/strings.js";
import * as PASS_S from "../passport/src/strings.js";
import * as INTERN_S from "../intern-passport/src/strings.js";
import * as AVAIL_S from "../availability/src/strings.js";
import * as SETTINGS from "../settings/src/ui.js";
import * as APP from "../app/src/ui.js";
import * as PASS from "../passport/src/ui.js";
import * as INTERN from "../intern-passport/src/ui.js";
import * as AVAIL from "../availability/src/ui.js";
import { navHTML, FEATURES, navLang, withLang, tx } from "../shared/nav.js";
import { authMessage, setAuthLang } from "../shared/auth.js";

const STR = [["settings", SETTINGS_S], ["app", APP_S], ["passport", PASS_S], ["intern-passport", INTERN_S], ["availability", AVAIL_S]];
const UIS = [["settings", SETTINGS], ["app", APP], ["passport", PASS], ["intern-passport", INTERN], ["availability", AVAIL]];
for (const [, M] of UIS) M.setLang("zh");

test("★ 五份字典的 COMMON 一樣，機制（T、pickLang、withLang、isErr）跟後台那四份逐字一樣", () => {
  for (const [label, S] of STR) {
    assert.deepEqual(S.COMMON, SETTINGS_S.COMMON, `${label} 的 COMMON 跟 settings/ 不一樣`);
    for (const fn of ["T", "pickLang", "withLang", "isErr", "setLang", "lang"]) {
      assert.equal(String(S[fn]), String(ADMIN_S[fn]), `${label} 的 ${fn} 跟 admin/ 不一樣`);
    }
    assert.equal(S.STORE_KEY, ADMIN_S.STORE_KEY, "六處要存同一個 localStorage 鍵，選一次到處都是");
  }
});

test("★ 每一個鍵 zh 與 en 都是字串，MINE 不跟 COMMON 撞鍵", () => {
  for (const [label, S] of STR) {
    for (const [k, row] of Object.entries(S.STRINGS)) {
      assert.equal(typeof row.zh, "string", `${label} 的 ${k} 少了 zh`);
      assert.equal(typeof row.en, "string", `${label} 的 ${k} 少了 en`);
    }
    for (const k of Object.keys(S.MINE)) assert.ok(!(k in S.COMMON), `${label} 的 MINE 跟 COMMON 都有 ${k}`);
  }
});

test("頂欄：lang 傳什麼畫什麼；沒傳在 Node 裡退成英文；連結帶 ?lang=", () => {
  const zh = navHTML({ current: "settings", role: "cadre", name: "a", lang: "zh" });
  const en = navHTML({ current: "settings", role: "cadre", name: "a", lang: "en" });
  assert.match(zh, />設定<\/a>/); assert.match(zh, />登出<\/button>/);
  assert.match(en, />Settings<\/a>/); assert.match(en, />Sign out<\/button>/);
  assert.match(en, /href="\/passport\/\?lang=en"/);
  assert.equal(navLang(), "en", "沒有 location 與 localStorage 的時候是英文");
  assert.equal(withLang("/x/#y", "zh"), "/x/?lang=zh#y");
  for (const f of FEATURES) assert.ok(tx(f.label, "en") && tx(f.label, "zh"));
  assert.doesNotMatch(en.replace(/<!--[\s\S]*?-->/g, "").replace(/title="[^"]*"|>a</g, ""), /[一-鿿]/, "英文的頂欄不剩中文");
});

test("登入的六句錯誤兩種語言都有，setAuthLang 切得動", () => {
  setAuthLang("en");
  assert.match(authMessage(null), /Something went wrong/);
  setAuthLang("zh");
  assert.match(authMessage(null), /出了點狀況/);
});

// 英文畫出來不能剩中文。餵進去的假資料全部用英文，剩下的中文就是漏翻的。
// 剔除：HTML 註解、placeholder（有幾格本來就要填中文）、切換鈕上的「中文」、
// 年級選項的 value（存進資料庫的是中文）、「打刪除兩個字」裡那兩個字。
const CJK = /[一-鿿]/;
function leftover(html) {
  const h = String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/ placeholder="[^"]*"/g, "")
    .replace(/ value="[^"]*"/g, "")
    .replace(/<div class="langrow"[\s\S]*?<\/div>/g, "")
    .replace(/張 O 睿/g, "")                 // 遮字的範例：那就是要人打的中文
    .replace(/<option>[\u4e00-\u9fff]+<\/option>/g, "")   // 縣市選單：縣市名是存進資料庫、畫在圖上的資料
    .replace(/[\u4e00-\u9fff]+ \/ [A-Za-z ]+/g, "");   // 時區的標籤（台北 / Taipei）本來就中英並排，是資料
  const m = h.match(CJK);
  return m ? h.slice(Math.max(0, m.index - 40), m.index + 40) : "";
}
function allEn(label, M, screens) {
  M.setLang("en");
  try {
    for (const [name, fn] of Object.entries(screens)) {
      const left = leftover(fn());
      assert.equal(left, "", `${label} 的 ${name} 用英文畫還剩中文：…${left}…`);
    }
  } finally { M.setLang("zh"); }
}

test("★ /settings/ 每一個畫面用英文畫出來不剩中文", () => {
  const cadre = { role: "cadre", board_role: "member", email: "a@x.io", name_zh: "", name_en: "Paul", team: "Marketing Team, Odd Team", avatar: "", public_profile: true, public_approved: false, title: "", ws: {} };
  const story = { display_name: "", school: "X High", county: "", city: "NYC", country: "US", place: "NYU", quote: "q", note: "n", public_story: true, story_approved: false };
  allEn("settings", SETTINGS, {
    cadre: () => SETTINGS.settingsHTML(cadre, "", false, story),
    director: () => SETTINGS.settingsHTML({ ...cadre, board_role: "director", public_approved: true }, "Saved.", true, { ...story, story_approved: true }),
    alumni: () => SETTINGS.settingsHTML({ ...cadre, role: "alumni" }, "", false, null),
    intern: () => SETTINGS.settingsHTML({ ...cadre, role: "intern" }, "", false, null),
    student: () => SETTINGS.settingsHTML({ role: "student", email: "s@x.io", name_zh: "", school: "", grade: "", newsletter_opt_in: false }, "", false, null),
    del: () => SETTINGS.deleteHTML("", false) + SETTINGS.deleteHTML("x", true),
    other: () => SETTINGS.downHTML() + SETTINGS.saveFailMessage(true, new Error("team_locked")) + SETTINGS.saveFailMessage(false, new Error("boom")) + SETTINGS.storyMissing({}).join(","),
  });
});

test("★ /app/ 每一個畫面用英文畫出來不剩中文", () => {
  const p = { name: "Amy", school: "X High", grade: "高二", newsletter: true };
  allEn("app", APP, {
    auth: () => ["in", "up", "forgot", "sent", "check"].map(m => APP.authHTML(m, "msg", "a@x.io", false)).join("") + APP.authHTML("in", "", "", true),
    notCadre: () => APP.notCadreHTML("msg") + APP.downHTML(),
    complete: () => APP.completeHTML(p, "", false) + APP.completeHTML(null, "x", true),
    student: () => APP.studentHTML(p, "", [{ id: "a1", form_id: "f1", status: "interview", title: "Camp", notify_by: "2026-12-15", interview_url: "https://cal.com/x" }, { id: "a2", form_id: "f2", status: "received", title: "Other", notify_by: "2026-12-15" }], [{ id: "f3", title: "New" }]) + APP.studentHTML(p, "", [], []) + APP.studentHTML({ name: "", school: "", grade: "", newsletter: false }, "", [], []),
    del: () => APP.deleteHTML("", false) + APP.deleteHTML("x", true),
    status: () => ["interview", "accepted", "rejected", "received"].map(s => APP.statusLine({ status: s, notify_by: "2026-12-15" })).join("|") + APP.fmtDay("2026-12-15"),
  });
});

const MONTHS = [9, 10, 11].map((m, i) => ({ seq: i + 1, month: m, theme_zh: "", theme_en: "" }));
const ACTS = [{ id: "09A", month: 9, category: "gather", title_zh: "", title_en: "OPENING", description: "d", callback_to: "" }, { id: "09B", month: 9, category: "prompt", title_zh: "", title_en: "WHY", description: "", callback_to: "09A" }, { id: "09C", month: 9, category: "frame", title_zh: "", title_en: "PHOTO", description: "" }];
const PROFILE = { id: "00000000-0000-0000-0000-000000000000", name_zh: "", name_en: "Paul Wang", team: "Marketing Team", issued: "2026-09-01", motto: "", avatar: null, intro_seen: true };

test("★ /passport/ 每一個畫面用英文畫出來不剩中文", () => {
  const S0 = () => ({ profile: PROFILE, stamps: {}, entries: {}, activities: ACTS, months: MONTHS, destinations: [{ code: "TPE", city: "TAIPEI", active: true }], visas: {}, page: 0, view: "passport", flipped: {}, wall: null, wallLoading: false, wallError: false });
  const stamped = () => { const S = S0(); S.stamps = { "09A": { date: "2026-09-10" }, "09B": { date: "2026-09-11" } }; S.entries = { "09A": { note: "fun", photo: null } }; return S; };
  allEn("passport", PASS, {
    bar: () => PASS.barHTML(S0()) + PASS.bookHTML(S0()),
    id: () => PASS.idPageHTML(S0()),
    guide: () => PASS.guidePageHTML() + PASS.introHTML(),
    month: () => PASS.monthPageHTML(stamped(), MONTHS[0]) + PASS.monthPageHTML(S0(), MONTHS[1]),
    callback: () => PASS.callbackHTML(stamped(), ACTS[1]) + PASS.callbackHTML(S0(), ACTS[1]),
    wall: () => { const S = stamped(); S.wall = [{ id: "u1", name_zh: "", name_en: "Amy", team: "Marketing Team", avatar: null, stamps: [{ act_id: "09A", stamped_on: "2026-09-10" }] }]; return PASS.wallHTML(S) + PASS.wallHTML({ ...S, wallLoading: true }) + PASS.wallHTML({ ...S, wallError: true }); },
    setup: () => PASS.setupHTML(PROFILE, { id: "u" }) + PASS.setupHTML({}, { id: "u" }) + PASS.downHTML(),
    pages: () => PASS.pagesOf(S0()).map(p => p.label).join(","),
  });
});

test("★ /intern-passport/ 每一個畫面用英文畫出來不剩中文", () => {
  const TASKS = [{ id: "T2627-01", category: "onboard", seq: 1, title_zh: "", title_en: "MEET BT", description: "d" }, { id: "T2627-02", category: "project", seq: 2, title_zh: "", title_en: "FIRST TASK", description: "" }, { id: "T2627-03", category: "reflect", seq: 3, title_zh: "", title_en: "WHY", description: "" }];
  const TERM = { id: "2026-27", title_zh: "", title_en: "INTERNSHIP 2026-27" };
  const S0 = (extra) => ({ profile: { ...PROFILE, term: "2026-27" }, tasks: TASKS, stamps: { "T2627-01": { date: "2026-10-01" } }, entries: {}, term: TERM, page: 0, view: "passport", flipped: {}, staff: false, wall: null, wallLoading: false, wallError: false, ...extra });
  allEn("intern-passport", INTERN, {
    book: () => INTERN.barHTML(S0()) + INTERN.bookHTML(S0()) + INTERN.barHTML(S0({ staff: true, view: "wall" })),
    id: () => INTERN.idPageHTML(S0()) + INTERN.idPageHTML(S0({ sample: true, profile: INTERN.sampleProfile(TERM) })) + INTERN.idPageHTML(S0({ term: null, profile: { ...PROFILE, term: "" } })),
    cat: () => INTERN.catPageHTML(S0(), "onboard") + INTERN.guidePageHTML(),
    wall: () => { const S = S0({ wall: [{ id: "u1", name_zh: "", name_en: "Amy", avatar: null, intern_stamps: [{ task_id: "T2627-01", stamped_on: "2026-10-01" }] }] }); return INTERN.wallHTML(S) + INTERN.wallHTML(S0({ wallLoading: true })) + INTERN.wallHTML(S0({ wallError: true })) + INTERN.wallHTML(S0({ wallError: true, staff: true })); },
    setup: () => INTERN.setupHTML(PROFILE, { id: "u" }) + INTERN.setupHTML({}, { id: "u" }) + INTERN.downHTML(),
    pages: () => INTERN.pagesOf(S0()).map(p => p.label).join(","),
  });
});

test("★ /availability/ 每一個畫面用英文畫出來不剩中文", () => {
  const members = [{ id: "u1", name: "Paul", alt: "", team: "Marketing Team", tz: "Asia/Taipei", updatedAt: "2026-10-01" }, { id: "u2", name: "Amy", alt: "", team: "Curriculum Team", tz: null, updatedAt: null }];
  const S = { members, slots: new Map([["u1", new Set(["1:600"])]]), allTeams: ["Marketing Team", "Curriculum Team"], team: "", mineMode: "usual", mine: new Set(["1:600"]), weekMine: new Set(), weekMarksMine: new Set(["2026-10-19"]), weekStart: new Date("2026-10-19T00:00:00Z"), myTz: "Asia/Taipei", chips: new Set([1]), bfrom: 19 * 60, bto: 22 * 60, copyFrom: 1, dirty: true, mineMsg: "" };
  const counts = new Map([["0:600", ["u1"]]]);
  allEn("availability", AVAIL, {
    shell: () => AVAIL.shellHTML("board", "", "10/19 – 10/25", "msg") + AVAIL.noticeHTML("", false) + AVAIL.noticeHTML("x", true),
    tz: () => AVAIL.tzSetupHTML("Asia/Taipei", "zzz", [], "") + AVAIL.tzSetupHTML(null, "", [{ tz: "Asia/Taipei", label: "Taipei" }], "x"),
    board: () => AVAIL.boardHTML(S, counts, ["10/19", "10/20", "10/21", "10/22", "10/23", "10/24", "10/25"]) + AVAIL.boardHTML({ ...S, members: [] }, new Map(), []),
    peek: () => AVAIL.peekHTML(S, { free: ["u1"], dayLabel: AVAIL.dayFull(1), minute: 600, lines: ["x"], calUrl: "https://x", title: "t", copyMsg: "" }),
    mine: () => AVAIL.mineHTML(S) + AVAIL.mineHTML({ ...S, mineMode: "week" }),
    members: () => AVAIL.membersHTML(S, Date.now()) + AVAIL.downHTML() + AVAIL.notCadreHTML(),
  });
});
