// /app/ 的邏輯：登入、註冊、忘記密碼、角色升級，以及登入後的選單。
//
// 這個資料夾**不 import passport/ 底下的任何東西**（見 ui.js 檔頭）。
// 資料層直接用 shared/auth.js，不經過 passport/src/data.js ——
// 那一支是護照的資料層，裡面有 loadAll 那一整包護照專用的查詢。
import * as AUTH from "../../shared/auth.js";
// supabase 本體要從 supabase.js 拿，**auth.js 沒有把它轉出去**。
// 寫成 AUTH.supabase 會是 undefined，而且只有在「登入成功之後」那一步才會炸，
// 登入頁本身完全正常 —— 那種錯誤最容易活著上線。
import { supabase } from "../../shared/supabase.js";
import * as UI from "./ui.js";

// view 只有在「學員」那條路上有意義：null 是 dashboard，
// "edit" 是補完／修改資料，"claim" 是輸入邀請碼，"delete" 是刪除確認。
// 幹部與未登入的人不看它。
let S = { user: null, role: null, name: "", authMode: "in", authMsg: "", authEmail: "", down: false,
          profile: null, pub: null, view: null, busy: false, apps: [], opens: [] };

// 登入之後送他回原本要去的地方。白名單、為什麼要存起來、為什麼包 try/catch，
// 全部在 nav.js —— 抽出去是為了測得到（main.js 一 import 就會跑 boot()）。
import { stashNext, takeNext } from "./nav.js";
const store = () => { try { return window.sessionStorage; } catch (e) { return null; } };

const root = () => document.getElementById("bt-root");

function render() {
  const el = root();
  if (!el) return;
  // 連不上要排在最前面：那時候 S.user 是空的，掉到登入頁等於對一個
  // 明明登入著的人說「請登入」（跟護照那邊同一個道理，spec §8.1）。
  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.user) { el.innerHTML = UI.authHTML(S.authMode || "in", S.authMsg, S.authEmail, S.busy); return; }
  if (S.role === "cadre") { el.innerHTML = UI.menuHTML(S.name || S.user.email, S.pub, S.authMsg, S.busy); return; }

  // 學員（批 2）。**資料沒填齊就先擋在補完那一頁**，
  // 因為學校與年級是這個帳號唯一有用的東西，缺了等於這個人不存在。
  if (S.view === "claim") { el.innerHTML = UI.notCadreHTML(S.authMsg); return; }
  if (S.view === "delete") { el.innerHTML = UI.deleteHTML(S.authMsg, S.busy); return; }
  if (S.view === "edit" || !UI.profileComplete(S.profile)) {
    el.innerHTML = UI.completeHTML(S.profile, S.authMsg, S.busy);
    // datalist 是等到使用者真的要打字才去載的（fillSchools 只跑一次）。
    const sc = document.getElementById("ps");
    if (sc) sc.addEventListener("focus", fillSchools, { once: true });
    return;
  }
  el.innerHTML = UI.studentHTML(S.profile, S.authMsg, S.apps, S.opens);
}


// 學校自動完成。**只載一次，而且是等到使用者點進那一格才載。**
// 那份 JSON 是 47KB，五百多間學校 —— 每個進到 /app/ 的人都載一次的話，
// 大多數人根本走不到那一格（幹部、只是來登入的人）。
//
// 載不到就算了：datalist 空的時候那一格就是一個普通的文字欄位，
// 使用者照樣填得進去。**這件事不值得對他說任何話**，
// 因為對他來說本來就沒有壞掉，跳一個錯誤訊息只會嚇到人。
let schoolsLoaded = false;
async function fillSchools() {
  if (schoolsLoaded) return;
  schoolsLoaded = true;
  try {
    const res = await fetch("./schools.json");
    if (!res.ok) return;
    const data = await res.json();
    const dl = document.getElementById("schools");
    if (!dl || !data || !Array.isArray(data.schools)) return;
    // 一次組好字串再塞，不要在迴圈裡 appendChild 五百次。
    dl.innerHTML = data.schools
      .map(s => `<option value="${String(s.label).replace(/"/g, "&quot;")}"></option>`).join("");
  } catch (e) {
    console.warn("學校清單載不到，那一格照樣可以自己打字。", e);
  }
}

// 我的申請 + 現在開放的。
//
// ⚠ **這兩句失敗不可以讓整頁掛掉。** 它們是 dashboard 上的兩區，
// 而 dashboard 最重要的是「我的資料」與「刪除帳號」那兩件事。
// 讀不到申請就少畫兩區，不要讓一個人因為這個而連自己的資料都看不到。
async function loadStudentBits() {
  try {
    const [ap, op] = await Promise.all([
      // forms 那一段是 PostgREST 的關聯查詢：applications 有 form_id 外鍵，
      // 所以拿得到那一份表單的標題與預計通知日，不用再打一次。
      supabase.from("applications")
        .select("id, form_id, status, submitted_at, forms(title, notify_by, interview_url)")
        .order("submitted_at", { ascending: false }),
      supabase.from("forms").select("id, title, opens_at, closes_at").eq("status", "open"),
    ]);
    if (ap.error) throw ap.error;
    if (op.error) throw op.error;
    S.apps = (ap.data || []).map(a => ({
      id: a.id, form_id: a.form_id, status: a.status,
      title: (a.forms && a.forms.title) || "（表單已經被刪掉）",
      notify_by: a.forms && a.forms.notify_by,
      interview_url: a.forms && a.forms.interview_url,
    }));
    const now = Date.now();
    S.opens = (op.data || []).filter(f =>
      (!f.opens_at || new Date(f.opens_at).getTime() <= now) &&
      (!f.closes_at || new Date(f.closes_at).getTime() >= now));
  } catch (e) {
    console.warn("讀不到申請，dashboard 少畫兩區。", e);
    S.apps = []; S.opens = [];
  }
}

async function boot() {
  try {
    S.authMsg = AUTH.configMessage();
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.down = false;
    S.user = who.user;
    if (!S.user) { render(); return; }

    // 只查自己那一列。**不要在這裡查護照的東西** —— 學員讀不到，
    // 而且這一頁不需要知道他蓋了幾個章。
    const { data, error } = await supabase
      .from("profiles")
      .select("role, name_zh, name_en, school, grade, newsletter_opt_in, public_profile, public_approved, public_title")
      .eq("id", S.user.id).maybeSingle();
    if (error) throw error;
    S.role = data ? data.role : null;
    S.name = data ? (data.name_zh || data.name_en || "") : "";
    // 學員頁只認一個 name。名字在資料庫裡是中英兩欄（幹部的護照要用），
    // 但學員只填一次，寫進 name_zh。這裡把兩欄收斂成一個值，
    // **收斂只做這一次**，畫面與存檔都用同一個。
    S.pub = data ? {
      public_profile: !!data.public_profile,
      public_approved: !!data.public_approved,
      public_title: data.public_title || "",
    } : null;
    S.profile = data ? {
      name: data.name_zh || data.name_en || "",
      school: data.school || "",
      grade: data.grade || "",
      newsletter: !!data.newsletter_opt_in,
    } : null;

    // 學員的申請與現在開放的表單。**幹部不必查**，那一頁用不到，
    // 而且多兩個查詢會讓每一次登入都慢一點。
    if (S.role !== "cadre") await loadStudentBits();

    // 是幹部而且他本來就是要去某個地方 → 直接送過去，不要讓他多按一次。
    // takeNext 會同時看網址與存起來的鑰匙，而且拿完就丟掉。
    // 兩條路（原地登入 / 繞完 Google 回來）走的是同一行，所以行為一致是構造上的，
    // 不是碰巧的。
    const n = S.role === "cadre" && takeNext(location.search, store());
    if (n) {
      root().innerHTML = `<div class="empty">帶你過去…</div>`;
      // replace 不留下歷史紀錄。用 href 的話，他從護照按上一頁會回到這裡，
      // 而這裡又會立刻把他送回護照 —— 上一頁就變成按不動的。
      location.replace(n);
      return;
    }
    render();
  } catch (e) {
    console.error("/app/ 載入失敗，畫面顯示的是「資料庫休眠中」那一頁。真正的原因：", e);
    S.down = true;
    render();
  }
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;

  if (act === "retry") { location.reload(); return; }
  // ⚠ 切換登入／註冊的時候**不要清掉 email**。
  // 一個人打完 email 才發現自己按錯邊，切過去又要重打一次。
  if (act === "switch-auth") { S.authMode = b.dataset.m; S.authMsg = ""; render(); return; }

  if (act === "do-signin" || act === "do-signup") {
    const email = document.getElementById("ae").value.trim();
    const pw = document.getElementById("ap").value;
    // ⚠ **先把 email 存起來，成功失敗都留著。**（2026-09-08 Paul 實測回報。）
    // 密碼打錯就要重打一次 email，是在懲罰一個本來就已經有點挫折的人。
    S.authEmail = email;
    // 空的就不要打網路 —— 空不空前端自己看得到，跑一趟只為了讓伺服器
    // 告訴我們這一格是空的（理由與實測見 passport/src/main.js 同一段）。
    if (!email || !pw) { S.authMsg = AUTH.authMessage(null); render(); return; }
    S.busy = true; S.authMsg = ""; render();
    try {
      if (act === "do-signup") {
        const data = await AUTH.signUp(email, pw);
        S.busy = false;
        // 開了 email 確認之後，註冊成功但**不會登入**（data.session 是 null）。
        // 舊版在這裡直接 boot()，而 boot() 找不到使用者就把同一張登入表單再畫一次 ——
        // 看起來就像按了沒反應。**沒有回應的送出，使用者只會再按一次。**
        if (!data || !data.session) { S.authMode = "check"; render(); return; }
      } else {
        await AUTH.signIn(email, pw);
        S.busy = false;
      }
      await boot();
    } catch (err) {
      S.busy = false;
      // 這個 email 已經有帳號 → **直接帶他回登入畫面**，email 留著。
      //（2026-09-08 Paul 實測回報。）叫他自己按「我已經有帳號了」再重打一次 email，
      // 是把一件我們已經知道答案的事丟回去給他做。
      if (err.message === AUTH.MSG_DUP_EMAIL) {
        S.authMode = "in";
        S.authMsg = "這個 email 已經有帳號了，直接登入就好。密碼忘記的話下面可以重設。";
      } else {
        S.authMsg = err.message;
      }
      render();
    }
    return;
  }

  if (act === "do-google") {
    S.authMsg = "";
    // 離開之前先把鑰匙收起來。**這一行才是真正讓 Google 那條路回得到護照的東西**
    // —— 下面 redirectTo 帶著 location.search 是第二層保險，不是主要機制
    //（實測過我們確實有送出去，但那一串要活過 GoTrue 的 callback，而那一步驗不到）。
    stashNext(location.search, store());
    try { await AUTH.signInWithGoogle(location.origin + location.pathname + location.search); }
    catch (err) { S.authMsg = err.message; render(); }
    // 成功的話瀏覽器已經在往 Google 跳，這裡不要 render()，那會在跳轉前閃一下。
    return;
  }

  if (act === "do-forgot") {
    const email = document.getElementById("fpe").value.trim();
    S.authEmail = email;
    if (!email) { S.authMsg = AUTH.authMessage(null); render(); return; }
    S.busy = true; S.authMsg = ""; render();
    // 相對路徑算出來，不要寫死線上網址 —— 寫死的話本機測不了。
    const redirectTo = new URL("../reset/", location.href).href;
    try { await AUTH.sendPasswordReset(email, redirectTo); }
    catch (err) { S.busy = false; S.authMsg = err.message; render(); return; }
    S.busy = false;
    // 這裡**不分辨**這個 email 有沒有帳號，理由見 ui.js 的 sent 那一段。
    S.authEmail = email; S.authMsg = ""; S.authMode = "sent"; render();
    return;
  }

  // 角色升級。**前端唯一碰得到角色的地方就是這裡，而它只是呼叫那支 RPC**
  //（規格 §3-5 第 4 點：前端不准有任何「設定角色」的路徑）。
  if (act === "do-claim") {
    const code = document.getElementById("ci").value.trim();
    if (!code) { S.authMsg = AUTH.authMessage(null); render(); return; }
    try { await AUTH.claimInvite(code); await boot(); }
    catch (err) { S.authMsg = err.message; render(); }
    return;
  }

  // ── 學員（批 2）─────────────────────────────────────────────────────
  if (act === "edit-profile") { S.view = "edit"; S.authMsg = ""; render(); return; }
  if (act === "show-claim")   { S.view = "claim"; S.authMsg = ""; render(); return; }
  if (act === "ask-delete")   { S.view = "delete"; S.authMsg = ""; render(); return; }
  if (act === "back-account"){ S.view = null; S.authMsg = ""; render(); return; }

  if (act === "save-profile") {
    const name = document.getElementById("pn").value.trim();
    const school = document.getElementById("ps").value.trim();
    const grade = document.getElementById("pg").value;
    const newsletter = document.getElementById("pnl").checked;
    if (!name || !school || !grade) {
      S.authMsg = "姓名、學校、年級三個都要填。"; render(); return;
    }
    S.busy = true; S.authMsg = ""; render();
    try {
      // **只送這四欄。** updated_at 與 newsletter_opt_in_at 由資料庫蓋，
      // 送了也會被覆蓋，而且 newsletter_opt_in_at 根本沒有發權限給前端 ——
      // 多送一欄會讓整句 update 被拒（2026-09-01 profiles.team 那個坑）。
      const { error } = await supabase.from("profiles").update({
        name_zh: name, school, grade, newsletter_opt_in: newsletter,
      }).eq("id", S.user.id);
      if (error) throw error;
      S.profile = { name, school, grade, newsletter };
      S.name = name;
      S.busy = false; S.view = null; render();
    } catch (err) {
      // ⚠ 失敗一定要說話。存檔失敗卻畫出一模一樣的畫面，使用者會再按一次、
      // 按五次、然後關掉（看板那一輪學到的同一件事）。
      S.busy = false; S.authMsg = "存不起來：" + (err.message || err); render();
    }
    return;
  }

  if (act === "do-delete") {
    const typed = document.getElementById("dc").value.trim();
    if (typed !== "刪除") { S.authMsg = "要在那一格打「刪除」兩個字才會執行。"; render(); return; }
    S.busy = true; S.authMsg = ""; render();
    try {
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      // 帳號沒了，本機的 session 也要清掉，不然下一次載入會拿著一張
      // 指向不存在的人的票，畫面會變成「登入著但什麼都查不到」。
      await AUTH.signOut();
      S = { user: null, role: null, name: "", authMode: "in",
            authMsg: "帳號已經刪掉了。謝謝你來過。", authEmail: "", down: false,
            profile: null, pub: null, view: null, busy: false, apps: [], opens: [] };
      render();
    } catch (err) {
      S.busy = false; S.authMsg = "刪不掉：" + (err.message || err); render();
    }
    return;
  }

  if (act === "save-public") {
    const on = document.getElementById("pubchk").checked;
    const t = document.getElementById("pubtitle");
    S.busy = true; S.authMsg = ""; render();
    try {
      // **只送這兩欄。** public_approved 沒有發權限給前端，
      // 送了整句會被拒，而那個拒絕長得像「存檔失敗」。
      const { error } = await supabase.from("profiles").update({
        public_profile: on,
        public_title: t ? (t.value.trim() || null) : (S.pub && S.pub.public_title) || null,
      }).eq("id", S.user.id);
      if (error) throw error;
      S.pub = { ...S.pub, public_profile: on,
                public_title: t ? t.value.trim() : (S.pub && S.pub.public_title) || "" };
      S.busy = false;
      S.authMsg = on ? "存好了。還要等 Co-President 核可才會出現在公開頁面上。" : "存好了，已經不公開了。";
    } catch (err) {
      S.busy = false; S.authMsg = "存不起來：" + (err.message || err);
    }
    render();
    return;
  }

  if (act === "signout") {
    await AUTH.signOut();
    S = { user: null, role: null, name: "", authMode: "in", authMsg: "", authEmail: "", down: false,
          profile: null, pub: null, view: null, busy: false, apps: [], opens: [] };
    render();
    return;
  }
});

boot();
