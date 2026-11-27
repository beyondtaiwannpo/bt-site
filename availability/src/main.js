// 每週時間看板（規格 §4、§5）。
import * as AUTH from "../../shared/auth.js";
import { supabase } from "../../shared/supabase.js";
import * as DATA from "./data.js";
import * as UI from "./ui.js";
import { navHTML } from "../../shared/nav.js";
// 側欄（2026-11-14 Paul：「add the sidebar to availability and passport too」）：跟首頁、後台同一條，樣式在 shared/rail.css。
import * as RAIL from "../../shared/rail.js";
import { searchTz } from "./tz-alias.js";
import { applyRange, copyDay, quickDays, diff } from "./edit.js";
// 2026-11-26：「團隊看板」（每半小時幾個人有空）與點一格的彈窗、排會搬到首頁行事曆的「日」（home/src/day.js、schedule.js、free.js）。
// 這一頁剩「我的時間」與「成員」兩個分頁；舊的 board.js、calendar.js、schedule.js 拿掉了。
import { startOfWeek, detectTz } from "./tz.js";
import { weekKeyOf } from "./weekkey.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

const root = () => document.getElementById("bt-root");
const K = DATA.key;

let S = {
  user: null, role: null, myTz: null, myName: "", down: false, ready: false,
  tab: "mine", members: [], slots: new Map(),
  team: "",                       // team 篩選，空字串是「全部」（見 view()）
  mine: new Set(), saved: new Set(), dirty: false, mineMsg: "",
  // 某一週的例外（2026-09-12）。weekSlots / weekMarks 是**全部人**的
  // （DATA.loadAll() 回來的原始形狀，board.js 的 boardCounts() 要吃這兩份），
  // 跟下面四個「我自己」的欄位分開放，不要混在一起——
  // 團隊看板要看全部人，「我的時間」只改自己那一份。
  weekSlots: new Map(), weekMarks: new Map(),
  mineMode: "usual",        // "usual" = 平常的時間、"week" = 某一週
  weekMine: new Set(),      // 目前這一週的例外格子（編輯中，畫面看得到的那一份）
  weekSaved: new Set(),     // 目前這一週 availability_week 資料表裡真正存的樣子，算差集用
  weekMarksMine: new Set(), // 我自己設定過例外的那幾週（給「已經設定過的這幾週」那份清單用）
  // 某一週模式裡，使用者是不是真的動過格子（2026-09-12 controller 二次審查裁定）。
  // syncWeekMine() 帶出的起點跟資料庫現況本來就不一樣（見那支的註解），
  // 光比對 weekMine/weekSaved 沒辦法分出「使用者真的改了」跟「只是換了一週還沒動」——
  // 沒有這個旗標，切到一個從沒設過例外的週會直接看到儲存鈕亮著，按下去就會把
  // 平常的時段整份寫成那一週的例外，而使用者什麼都還沒做。
  weekTouched: false,
  weekStart: null, weekOffset: 0,
  chips: new Set(), bfrom: 19 * 60, bto: 22 * 60, copyFrom: 1,
  needNotice: false, needTz: false, tzQuery: "", tzResults: [], tzGuess: null,
  msg: "", busy: false,
  // 「我的時間」那張表**只在進入那一頁或換了內容時**捲一次，不是每次重畫都捲。
  // 每次重畫都捲的話，使用者點一格、畫面重畫、捲動位置就被拉回去 —— 等於不能用。
  mineScrolled: false,
  // ws 是我被派進的工作區（側欄要用）。排會 2026-11-26 搬到首頁行事曆，回覆 2026-10-28 搬到 /home/。
  ws: {}, senior: false
};

// ── 畫面 ────────────────────────────────────────────────────────────
// 畫面看到的名單。**S.members 永遠是全部的人，篩選只發生在這裡。**
// 直接去改 S.members 的話，篩選會變成一個會吃掉資料的操作：
// 選了一個 team 之後，其他人就從這個分頁的狀態裡消失了，
// 而下一個要用全部名單的地方（例如選項本身）就再也長不出來。
//
// allTeams 一定要從**沒有篩過**的名單算，不然選了一個 team 之後
// 其他選項會全部不見，使用者就回不到「全部」了。
function view() {
  return { ...S, members: UI.filterByTeam(S.members, S.team), allTeams: UI.teamsOf(S.members) };
}

function render() {
  const el = root();
  if (!el) return;
  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.ready) { el.innerHTML = `<div class="empty">${T("loading")}</div>`; return; }
  // 未升級的人也有頂欄：對他來說功能項是空的，但 logo、名字、登出都在。
  if (S.role !== "cadre") { el.innerHTML = navHTML({ current: null, role: S.role, name: S.myName, lang: lang() }) + UI.notCadreHTML(); return; }
  // 側欄要的「我是誰」跟後台同一個形狀。S.team 在這一頁是看板的 team 篩選，所以自己的 team 放 S.myTeam。
  const me = { id: S.user.id, role: S.role, board: S.board, team: S.myTeam, name: S.myName, ws: S.ws, wsInfo: S.wsInfo || {}, senior: S.senior };
  const shell = body => {
    RAIL.railBefore(el);
    el.innerHTML = RAIL.shellHTML(navHTML({ current: "availability", role: S.role, name: S.myName, lang: lang() }),
      RAIL.railHTML("availability", "", me, {}, lang()), body, RAIL.areaTabsHTML("availability", "", me, lang()));
    RAIL.railAfter(el);
  };
  // 第一次進來的說明與選時區也在側欄裡：要先離開去別頁的人不用找上一頁。
  if (S.needNotice) { shell(UI.noticeHTML(S.msg, S.busy)); return; }
  if (S.needTz) { shell(UI.tzSetupHTML(S.tzGuess, S.tzQuery, S.tzResults, S.msg)); return; }

  let inner;
  const V = view();
  // 「我的時間」是自己的，跟 team 篩選無關，所以用 S 不是 V。
  if (S.tab === "who") inner = UI.membersHTML(V, Date.now());
  else inner = UI.mineHTML(S);
  shell(UI.shellHTML(S.tab === "who" ? "who" : "mine", inner, null, S.msg));
  // 「我的時間」那張表一打開停在 00:00 的話，填在晚上的人第一格在畫面外很遠（2026-09-12 實測：
  // 一個把時間填在晚上的人，第一格在往下 961px 的地方，而容器高度只有 503px）。
  // 差別是這一頁**每點一格就會重畫**，所以只能捲一次 —— 見 S.mineScrolled 的註解。
  // 一格都沒填的人捲到傍晚，因為上面那個批次工具的預設就是 19:00 到 22:00。
  if (S.tab === "mine" && !S.mineScrolled) {
    const g = el.querySelector(".gridwrap.mine");
    if (g) {
      const top = firstMineMinute(S.mineMode === "week" ? S.weekMine : S.mine);
      g.scrollTop = Math.max(0, ((top == null ? 18 * 60 : top) / 30) * 16 - 32);
      S.mineScrolled = true;
    }
  }
}

// 自己填的時段裡最早的那一刻（分鐘）。一格都沒有就回 null。
// 格子的鍵是 "weekday:minute"，這裡只看後面那一半。
function firstMineMinute(set) {
  let best = null;
  for (const k of (set || [])) {
    const m = Number(k.split(":")[1]);
    if (best === null || m < best) best = m;
  }
  return best;
}

// ── 啟動 ────────────────────────────────────────────────────────────
// 版本提示（2026-11-06，後台速度）：開頁問一次線上的 version.json（cache: no-store，繞過 GitHub Pages 的 10 分鐘快取），
// 跟這一頁載進來的 <meta name="bt-version"> 不一樣就在左下角掛一條「有新版本，重新整理」，不會自己消失。
// 讀不到就不提。後台那四份在 ui.js（checkVersion），這幾個資料夾各自一份一樣的。
export function versionDiffers(loaded, live) { return !!loaded && !!live && String(loaded) !== String(live); }
async function checkVersion(rootUrl) {
  if (typeof fetch === "undefined" || typeof document === "undefined") return false;
  try {
    const meta = document.querySelector('meta[name="bt-version"]');
    const r = await fetch(`${rootUrl}version.json`, { cache: "no-store" });
    if (!r.ok) return false;
    const j = await r.json();
    if (!versionDiffers(meta ? meta.content : "", j && j.v)) return false;
    document.querySelectorAll(".verbar").forEach(n => n.remove());
    const d = document.createElement("div");
    d.className = "verbar"; d.setAttribute("role", "status");
    d.innerHTML = `<span></span><button type="button" class="btn"></button>`;
    d.querySelector("span").textContent = T("ver.newer");
    const b = d.querySelector("button"); b.textContent = T("ver.reload"); b.addEventListener("click", () => location.reload());
    document.body.appendChild(d);
    return true;
  } catch (e) { return false; }
}

async function boot() {
  checkVersion("../");
  // 護照後台與舊書籤的「到時間看板排會」連結（?at=<時間>&title=<標題>）：排會搬到首頁行事曆的那一天了，直接轉過去。
  const q0 = new URLSearchParams(location.search);
  if (q0.get("at")) {
    const q = new URLSearchParams();
    for (const k of ["at", "title", "lang"]) if (q0.get(k)) q.set(k, q0.get(k));
    location.replace("../home/?" + q.toString() + "#calendar"); return;
  }
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { location.replace("../app/?next=availability"); return; }

    // ★ 這兩件事同時發，不要排隊。兩個要的都只有 S.user.id，而它已經在手上了。
    // 原本是等 profiles 回來才開始載看板，白白多一趟往返（實測到 Supabase 一趟
    // 熱的約 100 到 240 毫秒，第一趟要建連線約 650 毫秒）。
    //
    // ⚠ 為什麼一定要用 Promise.all，不能只是先塞進變數：supabase 的查詢建構器
    // 是**懶的**，它的 then() 裡面才真的去 fetch（vendor/supabase-js.js 裡讀得到）。
    // 只是 `const q = supabase.from(...)` 的話那一句根本還沒送出去，
    // 寫起來像同時發、跑起來還是接力，而且沒有任何地方會報錯。
    //
    // ⚠ 代價要講清楚：非幹部其實用不到看板資料，但我們還是先發了。
    // 學員誤按進來會多五個查詢（RLS 會擋掉，回來是空的）；換到的是
    // **每一位幹部每一次載入都少一趟往返**。幹部是這一頁的常態，所以這樣划算。
    // 2026-11-06 後台速度：「我是誰」改走 shared/auth.js 的 whoAmI（profiles 與 my_access 同時查、分頁快取十分鐘），
    // 原本這一頁要三層（profiles → my_access → profiles 再讀 board_role），現在一層。存了時區之後會 forgetMe()。
    const [whoRes, all] = await Promise.all([
      AUTH.whoAmI(S.user.id),
      DATA.loadAll(),
    ]);
    const data = whoRes.row;
    S.role = data ? data.role : null;
    S.myTz = data ? data.tz : null;
    S.myName = data ? (data.name_zh || data.name_en || "") : "";
    if (S.role !== "cadre") { S.ready = true; render(); return; }

    S.members = all.members; S.slots = all.slots;
    // 排會與回覆（2026-11-02）：我能排哪些範圍；信裡的連結 ?meeting=<id> 進來就先把那一場撈出來。
    S.ws = whoRes.ws || {}; S.wsInfo = whoRes.info || {};
    S.senior = !!data && ["president", "senior_adviser"].includes(data.board_role);
    S.board = (data && data.board_role) || "member"; S.myTeam = (data && data.team) || "";
    // 2026-10-28：回覆搬到幹部首頁。舊信裡的 /availability/?meeting=<id> 直接轉過去，那邊回覆、看誰會到。
    const mid = new URLSearchParams(location.search).get("meeting");
    if (mid) { location.replace("../home/?meeting=" + encodeURIComponent(mid)); return; }
    S.weekSlots = all.weekSlots; S.weekMarks = all.weekMarks;
    S.saved = new Set(S.slots.get(S.user.id) || []);
    S.mine = new Set(S.saved);
    // 我自己設定過例外的那幾週，給「我的時間」那份清單用。
    S.weekMarksMine = new Set(S.weekMarks.get(S.user.id) || []);

    const me = S.members.find(m => m.id === S.user.id);
    S.needNotice = !(me && me.noticeSeenAt);
    S.needTz = !S.myTz;
    S.tzGuess = detectTz();
    setWeek(0);
    S.ready = true;
    render();
  } catch (e) {
    // 票已經不能用了（帳號被停用、或伺服器換過簽章金鑰）。開機改用本機 session
    // 之後就沒有人在開機時問伺服器「這個帳號還有效嗎」了，所以這種人會一路走到
    // 這裡才被擋下來（理由與取捨見 shared/auth.js 的 currentUserDetailed）。
    // **不能讓他看到「資料庫休眠中」**：資料庫是好的，是他的票沒了，
    // 而那個畫面不會叫他重新登入，他會一直重整。
    // 先清掉本機那張壞票再走，不清的話下一頁讀出來的還是它。
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../app/?next=availability"); return; }
    console.error("看板載入失敗。真正的原因：", e);
    S.down = true; render();
  }
}
function setWeek(off) {
  S.weekOffset = off;
  const base = new Date(Date.now() + off * 7 * 86400000);
  // firstWeekday = 1：一週從星期一開始，跟畫面欄位一致。
  S.weekStart = startOfWeek(base, S.myTz || "UTC", 1);
}

// 兩個 Set 內容是不是一模一樣。借用 edit.js 的 diff()，不要自己重寫一次比對邏輯。
function setsEqual(a, b) {
  const d = diff(a, b);
  return !d.add.length && !d.del.length;
}

// 依「目前這個模式」重新算 S.dirty，不是沿用舊值。
//
// ⚠ **切模式、翻週之後一定要呼叫這支。** S.dirty 是兩個模式共用的單一旗標；
// 如果留著舊值不管，切模式或翻週之後儲存鈕可能是亮的，即使這個模式裡什麼都還沒改。
// 那不只是外觀問題：某一週還沒有例外時 S.weekSaved 是空集合，這時候如果按下
// 那顆「不該亮但亮著」的儲存鈕，saveWeek() 會把 S.weekMine（剛被 syncWeekMine()
// 填成平常的時段）整份當成新資料寫進去，等於把平常的時間整份寫成那一週的例外，
// 而且會建 mark——那一週從此跟平常的時間脫鉤，使用者不會發現。
// （2026-09-12 controller 審查抓到，見 task-6-report.md 的修正段落。）
//
// ⚠ **某一週模式再多一層：光比對 weekMine/weekSaved 不夠。**
// syncWeekMine() 帶出的起點（平常的時段）本來就跟資料庫現況（空集合）不一樣，
// 這是刻意的設計，不是 bug（見 syncWeekMine() 的註解——weekSaved 不能偷懶
// 帶成起點，不然差集會算錯）。但這代表「起點跟資料庫不同」不能當作「使用者動過」
// 的證據：切到一個從沒設過例外的週，畫面一開始就會顯示跟資料庫不同的東西，
// 這是正常的初始狀態，不是使用者的操作。所以某一週模式要多看 S.weekTouched——
// 使用者真的碰過格子才算 dirty，單純換到一個新週不算。
function recomputeDirty() {
  S.dirty = S.mineMode === "week"
    ? (S.weekTouched && !setsEqual(S.weekMine, S.weekSaved))
    : !setsEqual(S.mine, S.saved);
}

// 「我的時間」目前在編輯的是哪一份 Set —— 平常的（S.mine）還是某一週的（S.weekMine）。
// toggle / apply / copyday 都要透過這支改，不能直接寫死 S.mine：
// 不然在「某一週」模式下點格子，改到的其實是平常的時間，畫面看起來有變，
// 但存檔存的是另一份資料，使用者完全看不出來哪裡錯了。
//
// ⚠ **這支只在真的要拿去改的時候呼叫**（toggle 直接改回傳的參照、
// apply/copyday 算完之後透過 setMineTarget() 存回去）——三個呼叫點都是這樣用，
// 所以「某一週」模式下呼叫這支本身就等於「使用者真的動了這一週的格子」，
// 在這裡把 S.weekTouched 設成 true 是最不會漏掉、也不會重複判斷的地方
// （recomputeDirty() 要用這個旗標分辨「換了一週」跟「真的編輯過」，見那支的註解）。
function mineTarget() {
  if (S.mineMode === "week") S.weekTouched = true;
  return S.mineMode === "week" ? S.weekMine : S.mine;
}
function setMineTarget(set) { if (S.mineMode === "week") S.weekMine = set; else S.mine = set; }

// 切到「某一週」模式、或在那個模式下翻週之後，把這一週要編輯的起點準備好。
//
// 這一週已經被我自己動過例外，就帶出例外本身；還沒有的話帶出**平常的時段**
// 當起點——這是規格明寫的「預先帶出當起點」，讓人從自己平常的時間開始改，
// 不是對著一張空表重填。
//
// **weekSaved 永遠對到 availability_week 資料表目前真正存的樣子**
// （沒有例外就是空集合），不是「畫面上看到的起點」——
// 這樣 saveWeek() 算差集才會對：第一次存某一週時，wanted 是整份平常的時段、
// current 是空的，差集會把整份平常的時段當新資料寫進去，這是對的；
// 如果 weekSaved 也偷懶帶成平常的時段，第一次存檔就會被誤判成「沒有變動」，
// 資料庫裡那一週的 mark 也不會被建起來。
//
// **每次呼叫都把 weekTouched 重設成 false。** 切模式、翻週都會經過這裡，
// 那正是「換到一個新的週，使用者還沒動過」的時刻——不重設的話，
// 上一週按過格子留下的 weekTouched=true 會被這一週繼續冒用。
function syncWeekMine() {
  const wk = weekKeyOf(S.weekStart, S.myTz);
  const marked = S.weekMarksMine.has(wk);
  const existing = (S.weekSlots.get(S.user.id) || new Map()).get(wk) || new Set();
  S.weekSaved = new Set(existing);
  S.weekMine = new Set(marked ? existing : S.saved);
  S.weekTouched = false;
}

// ── 自動儲存（2026-11-06，Paul：「希望每一格都像 Workspaces 那一頁一樣，改了就存」）──
// 格子是點一下切換，而且一次會連點很多格，所以不是每一下都存：點了之後 800 毫秒沒再點就存一次
//（UI.debounce，跟後台欄位的停頓時間同一個數字）。套用整段、複製整天那種批次動作也走同一條。
// 「儲存」鈕沒有了，底下那行小字（.autosave）顯示存檔中／存好了／沒存進去，結果那一句仍然寫在 S.mineMsg
// 那個位置（.mini），但**不 render()**：336 個格子重畫會讓捲動位置跳掉，使用者正在格線中間微調。
//
// 兩條規矩：
//   1. 一次只跑一個存檔；跑的時候又點了格子，跑完再存一次（不丟掉後面那一次改動）。
//      saveMine / saveWeek 是算差集寫入的，兩個重疊著跑會把同一格寫兩次（主鍵撞到就報錯）。
//   2. 換模式、翻週、換分頁、取消某一週、登出之前先把還沒存的存完（flushSave）。
//      存的是哪一份表（平常的 S.mine 還是某一週的 S.weekMine）在開始存的那一刻就定下來，
//      存完回來只動那一份對應的東西，不碰使用者已經切過去的另一份。
let savePending = false, saveRunning = null, saveAgain = false;
const saveDebounced = UI.debounce(() => { savePending = false; saveNow(); }, UI.AUTOSAVE_MS);
function scheduleSave() { savePending = true; saveDebounced(); }
async function flushSave() {
  if (savePending) { savePending = false; saveDebounced.cancel(); await saveNow(); }
  else if (saveRunning) await saveRunning;
}
const mineBox = () => document.querySelector('[data-autosave="save"]');
function sayMine(text) {
  S.mineMsg = text;
  const box = mineBox();
  const el = box && box.querySelector(".mini");
  if (el) el.textContent = text;
}
function saveNow() {
  if (saveRunning) { saveAgain = true; return saveRunning; }
  saveRunning = (async () => {
    try { await saveOnce(); }
    finally {
      saveRunning = null;
      if (saveAgain) { saveAgain = false; saveNow(); }
    }
  })();
  return saveRunning;
}
async function saveOnce() {
  if (!S.user) return;
  readBatch();
  UI.autosaveState(mineBox(), "saving");
  // 「某一週」模式存的是 availability_week，不是 availability，
  // 走完全不同的一支（差集也是另外兩份 Set）。
  if (S.mineMode === "week") {
    const wk = weekKeyOf(S.weekStart, S.myTz);
    const wanted = new Set(S.weekMine), current = new Set(S.weekSaved);
    try {
      const r = await DATA.saveWeek(S.user.id, wk, wanted, current);
      // 還停在同一週才動 weekSaved；翻走了的話那一份已經是別週的。
      if (S.mineMode === "week" && weekKeyOf(S.weekStart, S.myTz) === wk) S.weekSaved = new Set(wanted);
      S.weekMarksMine.add(wk);
      // 團隊看板讀 S.weekSlots / S.weekMarks（全部人的那一份），
      // 存好也要一起同步，不然要重新整頁才看得到自己剛存的例外。
      if (!S.weekSlots.has(S.user.id)) S.weekSlots.set(S.user.id, new Map());
      S.weekSlots.get(S.user.id).set(wk, new Set(wanted));
      if (!S.weekMarks.has(S.user.id)) S.weekMarks.set(S.user.id, new Set());
      S.weekMarks.get(S.user.id).add(wk);
      // 剛存的是某一週，平常的時間有沒有還沒存是另一件事 ——
      // 重新問一次兩邊是不是還一樣，不能直接寫 false。
      recomputeDirty();
      UI.autosaveState(mineBox(), "saved");
      sayMine(r.add || r.del ? T("m.savedDiff", { a: r.add, d: r.del }) : T("m.noChange"));
    } catch (err) {
      console.error("某一週存檔失敗：", err);
      S.dirty = true;
      UI.autosaveState(mineBox(), "failed");
      sayMine(DATA.authMessage(err));
    }
    return;
  }
  const wanted = new Set(S.mine), current = new Set(S.saved);
  try {
    const r = await DATA.saveMine(S.user.id, wanted, current);
    S.saved = new Set(wanted);
    S.slots.set(S.user.id, new Set(wanted));
    // 反過來同一個道理：剛存的是平常的時間，某一週那邊有沒有還沒存要重新問一次。
    recomputeDirty();
    const me = S.members.find(m => m.id === S.user.id);
    if (me) me.updatedAt = new Date().toISOString();
    UI.autosaveState(mineBox(), "saved");
    sayMine(r.add || r.del ? T("m.savedDiff", { a: r.add, d: r.del }) : T("m.noChange"));
  } catch (err) {
    console.error("存檔失敗：", err);
    S.dirty = true;
    UI.autosaveState(mineBox(), "failed");
    sayMine(DATA.authMessage(err));
  }
}

// ── 事件 ────────────────────────────────────────────────────────────
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;

  if (act === "retry") { location.reload(); return; }
  // 側欄的中英切換：存起來、網址帶 ?lang=，跟首頁同一招。
  if (act === "lang") {
    setLang(b.dataset.lang); document.documentElement.lang = lang() === "zh" ? "zh-Hant" : "en";
    try { localStorage.setItem(STORE_KEY, lang()); } catch (e2) { /* 無痕視窗 */ }
    const u = new URL(location.href); u.searchParams.set("lang", lang()); history.replaceState(null, "", u.pathname + u.search + u.hash);
    render(); return;
  }
  // 頂欄的登出。這一頁之前沒有登出（只有「回入口」），現在頂欄有了就要接。
  if (act === "signout") { await flushSave(); await AUTH.signOut(); location.replace("../app/"); return; }
  if (act === "tab") { await flushSave(); S.tab = b.dataset.t; S.mineScrolled = false; render(); return; }
  // team 篩選（成員那一頁）。
  if (act === "team") { S.team = b.dataset.team || ""; render(); return; }

  if (act === "week") {
    const d = +b.dataset.d;
    // 往前四週（Paul 2026-09-02 裁定，往前只是回顧而且不能改）；
    // 往後不限（Paul 2026-09-12：本週加未來全部都可以填，看板要看得到那麼遠）。
    const next = d === 0 ? 0 : Math.max(-4, S.weekOffset + d);
    // 已經在邊界的話**要說話**，不能按了沒反應 —— 那正是這一頁反覆出現的症狀。
    // 上限拿掉之後只剩往前這一種邊界，所以訊息不用再看方向。
    if (next === S.weekOffset && d !== 0) {
      S.msg = T("m.onlyBack");
      render(); return;
    }
    S.msg = "";
    await flushSave();     // 正在編某一週而且還沒存的，先存完再翻週
    setWeek(next);
    // 兩個分頁共用同一個 handler、同一份 S.weekStart（Paul 2026-09-12 裁定，
    // 不依分頁分流）：翻週的時候如果正在編某一週，起點要跟著換到新的那一週。
    if (S.mineMode === "week") { syncWeekMine(); recomputeDirty(); S.mineScrolled = false; }
    render(); return;
  }

  if (act === "notice-ok") {
    // 連點會送出兩次請求。第二次撞主鍵之後現在雖然不會報錯，
    // 但畫面在那兩秒裡完全沒有反應，而「沒有反應」正是這個 bug 的形狀。
    if (S.busy) return;
    S.busy = true; S.msg = ""; render();
    try {
      await DATA.markNoticeSeen(S.user.id);
      S.needNotice = false; S.busy = false; render();
    } catch (err) {
      console.error("記錄告知失敗。真正的原因：", err);
      S.busy = false;
      S.msg = DATA.authMessage(err);
      render();
    }
    return;
  }

  if (act === "tz-pick") {
    // 這一步會打網路。沒有這個 busy 的話，網路慢的時候點下去完全沒反應 ——
    // 跟知情同意那個 bug 是同一個形狀（2026-09-02 順手補的）。
    if (S.busy) return;
    S.busy = true; S.msg = T("m.saving"); render();
    try {
      await DATA.saveTz(S.user.id, b.dataset.tz);
      AUTH.forgetMe(); // 時區在「我是誰」的分頁快取裡，存了就讓下一頁重讀
      S.myTz = b.dataset.tz; S.needTz = false; S.msg = ""; S.busy = false;
      // 2026-11-09 走一遍新幹部的流程撞到的：members 是設時區之前載的，我那一列的 tz 還是空的，
      // 看板於是說「還沒有人設定時區」、我填的時間也畫不出來。把自己那一列補上；第一次設完直接到「我的時間」，那才是接下來要做的事。
      const me = S.members.find(m => m.id === S.user.id);
      if (me) me.tz = b.dataset.tz; else { try { const all = await DATA.loadAll(); S.members = all.members; S.slots = all.slots; } catch (e) { /* 下一次重整就有了 */ } }
      S.tab = "mine";
      setWeek(S.weekOffset); render();
    } catch (err) {
      console.error("設定時區失敗。真正的原因：", err);
      S.busy = false; S.msg = DATA.authMessage(err); render();
    }
    return;
  }
  // 2026-11-08：「改時區」搬到設定頁（settings/），這裡只剩第一次沒有時區時的那一張。

  // 「我的時間」的兩個模式：平常的時間 ／ 某一週。
  if (act === "mine-mode") {
    await flushSave();     // 還沒存的先存完再換模式，不然等一下存的是另一份表
    S.mineMode = b.dataset.m; S.mineMsg = "";
    // 換了模式就是換了一份表，捲動要重新對位。
    S.mineScrolled = false;
    // 切進「某一週」要先把起點準備好，不然畫面會先閃一次空表。
    if (S.mineMode === "week") syncWeekMine();
    // 不管切去哪個模式都要重算 S.dirty——沿用切換前的舊值的話，
    // 儲存鈕可能因為另一個模式沒存的編輯而亮著，見 recomputeDirty() 的註解。
    recomputeDirty();
    render(); return;
  }
  // 取消某一週的例外，回到平常的時間。清單裡任何一週都可以按，
  // 不限於現在正在看的那一週。
  if (act === "clear-week") {
    if (S.busy) return;
    await flushSave();
    const wk = b.dataset.w;
    S.busy = true; S.mineMsg = ""; render();
    try {
      await DATA.clearWeek(S.user.id, wk);
      S.weekMarksMine.delete(wk);
      // 團隊看板讀的是 S.weekMarks / S.weekSlots（全部人的那一份），
      // 這兩份也要一起清掉，不然自己這一格要等下次重新整頁才會消失。
      if (S.weekMarks.has(S.user.id)) S.weekMarks.get(S.user.id).delete(wk);
      if (S.weekSlots.has(S.user.id)) S.weekSlots.get(S.user.id).delete(wk);
      // 剛好是正在編輯的那一週，畫面上的格子也要跟著回到平常的時間。
      if (wk === weekKeyOf(S.weekStart, S.myTz)) {
        S.weekMine = new Set(S.saved); S.weekSaved = new Set();
        // 跟 I1 同一個根因：清乾淨之後這一週等於沒動過，weekTouched 也要跟著歸零，
        // 不然使用者若在這一週改了東西沒存、又按了這顆鍵，S.dirty 會留在 true，
        // 可能導致再存一次又建立一份一模一樣的例外。
        S.weekTouched = false;
      }
      recomputeDirty();
      S.busy = false; S.mineMsg = T("m.reverted");
    } catch (err) {
      console.error("取消某一週失敗。真正的原因：", err);
      S.busy = false;
      S.mineMsg = T("m.revertFail") + DATA.authMessage(err);
    }
    render(); return;
  }

  if (act === "chip") {
    const wd = +b.dataset.wd;
    S.chips.has(wd) ? S.chips.delete(wd) : S.chips.add(wd);
    readBatch(); render(); return;
  }
  if (act === "quick") {
    const q = b.dataset.q;
    S.chips = new Set(quickDays(q));
    readBatch(); render(); return;
  }

  if (act === "apply") {
    readBatch();
    if (!S.chips.size) { S.mineMsg = T("m.pickDays"); render(); return; }
    if (S.bfrom >= S.bto) { S.mineMsg = T("m.endAfter"); render(); return; }
    const add = b.dataset.mode === "add";
    // 兩種模式共用同一顆按鈕，改到哪一份 Set 由 mineTarget() 決定 ——
    // 寫死 S.mine 的話「某一週」模式點下去改的其實是平常的時間，
    // 畫面看起來有反應，存檔卻存錯地方。
    const r = applyRange(mineTarget(), [...S.chips], S.bfrom, S.bto, add);
    setMineTarget(r.set);
    const n = r.changed;
    S.dirty = true;
    S.mineMsg = T(add ? "m.added" : "m.removed", { n });
    render(); scheduleSave(); return;
  }

  if (act === "copyday") {
    readBatch();
    const from = +document.getElementById("copyfrom").value;
    S.copyFrom = from;
    if (!S.chips.size) { S.mineMsg = T("m.pickCopy"); render(); return; }
    const r = copyDay(mineTarget(), from, [...S.chips]);
    setMineTarget(r.set);
    S.dirty = true;
    S.mineMsg = T("m.copied", { n: r.changed });
    render(); scheduleSave(); return;
  }

  // 單格微調**不整頁重畫**：336 個格子重畫會讓捲動位置跳掉，
  // 而使用者正在格線中間微調。只改那一顆按鈕的狀態。
  if (act === "toggle") {
    const k = K(+b.dataset.wd, +b.dataset.m);
    const target = mineTarget();
    const on = !target.has(k);
    on ? target.add(k) : target.delete(k);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    S.dirty = true;
    scheduleSave();
    return;
  }

  // 2026-11-06：「儲存」鈕沒有了，存檔走上面的 saveNow()（點格子之後 800 毫秒沒再動就存）。

  if (act === "confirm-same") {
    // 一樣會打網路，一樣要先講話再等。
    b.disabled = true; b.textContent = T("m.recording");
    try {
      const at = await DATA.confirmUnchanged();
      const me = S.members.find(m => m.id === S.user.id);
      if (me) me.updatedAt = at;
      S.mineMsg = T("m.confirmed");
    } catch (err) {
      console.error("確認沒變失敗。真正的原因：", err);
      S.mineMsg = DATA.authMessage(err);
    }
    render(); return;
  }
});

document.addEventListener("input", e => {
  if (e.target.id === "tzq") {
    S.tzQuery = e.target.value;
    S.tzResults = searchTz(S.tzQuery);
    const list = document.querySelector(".tzlist");
    if (list) list.innerHTML = S.tzResults.map(r =>
      `<button class="tzitem" data-act="tz-pick" data-tz="${r.tz}"><b>${r.label}</b><span>${r.tz}</span></button>`
    ).join("") || `<div class="empty sm">${T("tz.none", { q: UI.esc(S.tzQuery) })}</div>`;
  }
});

// 送出前把兩個選單的值收進 S，不然重畫之後會回到預設值。
function readBatch() {
  const f = document.getElementById("bfrom"), t = document.getElementById("bto");
  if (f) S.bfrom = +f.value;
  if (t) S.bto = +t.value;
  const c = document.getElementById("copyfrom");
  if (c) S.copyFrom = +c.value;
}

// 語言（2026-10-19 中英切換）。網址 ?lang= 先、再 localStorage 的、都沒有就英文。切換鈕在 /settings/，這一頁跟著走。
function readStored() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
setLang(pickLang(location.search, readStored()));
document.documentElement.lang = lang() === "zh" ? "zh-Hant" : "en";
boot();
