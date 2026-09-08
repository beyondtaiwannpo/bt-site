// /app/ 的畫面。登入、註冊、忘記密碼、以及「你還不是幹部」那一頁。
// 2026-09-07：卡片裡不再放 logo。頁面本身（app/index.html）在 #bt-root 外面
// 有一個 logo，那個同時是「回 Beyond Taiwan 首頁」的連結 ——
// 外人從對外頁按「登入」進來，得有辦法回去。
// 兩個一模一樣的 logo 上下相隔一百多 px，看起來像出錯，不像設計。
//
// 2026-09-02（階段 7 前置）：這幾支從 passport/src/ui.js 原樣搬過來。
// 搬的理由是規格 §2-1 的分工：`/app/` 是登入後的入口，`/passport/` 只剩護照本身。
// 登入表單留在護照裡的話，「護照」這個資料夾同時是登入頁、升級頁與護照，
// 而階段 7 要重做視覺的時候會分不清哪些樣式屬於哪一件事。
//
// **esc 是這裡自己的一份，不是從護照 import 的。** 兩行字的東西，
// 為了它讓 /app/ 去依賴 /passport/ 的模組，等於把「護照壞掉」變成
// 「連登入頁都打不開」。這兩個資料夾之間**不要有任何 import**。

// 選單卡片從 shared/nav.js 的 FEATURES 產生，跟頂欄同一份清單 —— 兩份清單的話
// 漏加的那一頁不會壞、只會少一個入口，而那種缺陷沒有人會回報。
import { featuresFor } from "../../shared/nav.js";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ⚠ 這裡原本有一段註解寫著「不做自助重設、不做重設畫面、不呼叫
// resetPasswordForEmail（spec §6.3）」。**那段話 2026-09-01 起是錯的** ——
// 自助重設做了，重設畫面在 /reset/，resetPasswordForEmail 在 shared/auth.js。
// 那是規格早期的決定，被實作推翻之後沒有人回來改這段字，於是它變成一句
// 會擋住下一個人的指示。留這幾行是為了說明它被推翻過，不是要繼續守它。
// mode：in（登入）／up（註冊）／forgot（要重設連結）／sent（寄出去了）
// email 只有 sent 用得到，用來把使用者剛才打的字回顯 —— 打錯字的人才看得出來。
export function authHTML(mode, msg, email) {
  const up = mode === "up";

  // ── 忘記密碼：輸入 email ──
  if (mode === "forgot") return `<div class="card">
    <h2>忘記密碼</h2>
    <div class="sub">輸入你註冊時用的 email，我們寄一封重設連結給你。</div>
    ${msg ? `<div class="wnote" style="margin:0 0 16px">${esc(msg)}</div>` : ""}
    <label><i>Email</i><input id="fpe" type="email" autocomplete="email" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="you@example.com"></label>
    <div class="stack">
      <button class="btn" data-act="do-forgot">寄出重設連結</button>
    </div>
    <div class="nav"><button class="link" data-act="switch-auth" data-m="in">回登入</button></div>
    <div class="note"><b>用 Google 登入的話不需要密碼</b>，回登入頁直接按那顆 Google 按鈕就好。這一頁只對「用 email + 密碼註冊」的人有用。</div>
    <div class="note">連 email 也想不起來？寄信到 beyondtaiwan2020@gmail.com，我們幫你找。</div>
  </div>`;

  // ── 寄出之後 ──
  // ⚠ **這裡的文案不可以寫「已寄出」。**
  // Supabase 對「存在的信箱」與「不存在的信箱」回一模一樣的成功，那是刻意的：
  // 不然任何人都能拿這個表單一次一個 email 問「這個人是不是 BT 幹部」，
  // 而幹部名單本身就是我們不該外流的東西。
  // 前端的文案要跟那個事實一致 —— 寫「如果這個信箱有帳號」，不要寫「已寄出」。
  // test/ui-pages.test.mjs 有一條在守這件事。
  if (mode === "sent") return `<div class="card">
    <h2>信寄出去了</h2>
    <div class="sub">如果 <b>${esc(email || "那個信箱")}</b> 有帳號，我們寄了一封重設連結給它。</div>
    <div class="note" style="margin-top:0">沒收到的話，先看一下垃圾郵件匣。連結大約一小時內有效，過期了再回來要一次就好。</div>
    <div class="nav"><button class="link" data-act="switch-auth" data-m="in">回登入</button></div>
    <div class="note">試了幾次都收不到？寄信到 beyondtaiwan2020@gmail.com，我們直接幫你處理。</div>
  </div>`;

  return `<div class="card">
    <h2>${up ? "註冊" : "登入"}</h2>
    <!-- 註冊不再需要邀請碼（2026-09-01，階段 5-7 把門搬到角色升級）。
         **那格輸入已經移除，不是留著不讀。** 留著的話它是一句謊：使用者會以為
         自己填的東西有作用，打錯了還會以為是自己的問題，而實際上不管填什麼都會
         註冊成功、身分都是 student。**沒有作用的輸入框比沒有輸入框更糟。**
         邀請碼現在在登入之後那一頁輸入（notCadreHTML）。 -->
    <div class="sub">${up ? "先開帳號，之後再輸入邀請碼升級成幹部。" : "用你註冊時的 email 登入。"}</div>
    ${msg ? `<div class="wnote" style="margin:0 0 16px">${esc(msg)}</div>` : ""}
    <!-- 邀請碼那格的 autocapitalize/autocorrect/spellcheck 全部關掉。
         **大小寫那一半已經不再是理由**：trigger 現在是
         where upper(btrim(code)) = upper(btrim(v_code))，手機鍵盤把第一個字母變成大寫
         也對得到（見 supabase/migrations/2026-08-17-invite-code-case-insensitive.sql）。
         留著這幾個屬性是為了另外那一半，而那一半沒有變：autocorrect 與 spellcheck 會把
         它不認得的字串**換成別的字**，那是使用者看不見的竄改，資料庫救不了 ——
         學生只會看到「這個邀請碼不對」，然後把同一組碼再打十次。
         2026-08-17 那個把小寫碼轉成大寫的 bug 就是這一類，只是發生在程式裡
         （見 main.js 那段註解）。
         email 那格同樣關掉：GoTrue 自己會把 email 正規化成小寫，所以大小寫不致命，
         但 autocorrect 會把不認得的字串改掉，那是同一種「使用者看不見的竄改」。
         密碼那格不必：type="password" 本來就不會自動大寫或自動更正。 -->
    <label><i>Email</i><input id="ae" type="email" autocomplete="email" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="you@example.com"></label>
    <label><i>密碼 / Password${up ? "（至少 6 個字）" : ""}</i><input id="ap" type="password" autocomplete="${up ? "new-password" : "current-password"}"></label>
    <!-- 「會出現在進度牆上」那段告知從註冊頁搬到升級頁（notCadreHTML）。
         5-7 之後註冊出來的是 student —— 他不會上牆、也還沒有護照，
         在那個時間點講這段話是錯的時機，而且會讓人以為註冊就等於加入 BT。
         真正該講的時刻是**升級成幹部的那一下**，那才是資料開始被別人看得到的時刻。
         規格 §4-5 的原則：要在第一次進入之前明講。 -->
    <!-- 2026-09-02：註冊那顆按鈕的字改過。舊的那句以邀請碼當作註冊的前提，
         **而那個前提 5-7 之後就沒有了** —— 註冊不需要邀請碼，任何人都開得了帳號，
         邀請碼是登入之後升級成幹部才用的。
         錯的方向剛好是最糟的那一種：它讓一個還沒拿到碼的人以為自己不能註冊，
         而他不會來問，他會關掉頁面。
         （這段刻意不引用舊的那句字面 —— HTML 註解是會送到瀏覽器的，
           引用它等於把那句話留在頁面裡，守門也會抓到。） -->
    <div class="stack">
      <button class="btn" data-act="${up ? "do-signup" : "do-signin"}">${up ? "註冊" : "登入"}</button>
    <!-- Google 登入（規格 §3-4）。**email + 密碼那條路不要拿掉**：
         有人沒有 Google 帳號、有人在中國、有人的 Google 就是登不進去。
         兩條路並存是規格明寫的決定，不是過渡狀態。

         按鈕只有文字、沒有 Google 的彩色 logo：硬規則是一個畫面最多三種顏色
         （見 shared/brand.css），而那個 logo 自己就有四種。用文字是誠實的取捨，
         不是偷懶 —— 要放官方 logo 就得先改硬規則，那不是這一步的事。

         登入與註冊兩種模式都放，因為 Google 那條路沒有「註冊」與「登入」之分：
         第一次點就是註冊，第二次點就是登入，使用者不需要先決定自己是哪一種。 -->
      <!-- 標籤只有中文：雙語標籤正是它折成兩行的原因，而「Google」這個字不需要翻譯
           （使用者 2026-09-03 裁定）。 -->
      <button class="btn ghost" data-act="do-google">用 Google 登入</button>
    </div>
    <div class="nav"><button class="link" data-act="switch-auth" data-m="${up ? "in" : "up"}">${up ? "我已經有帳號了" : "還沒有帳號，要註冊"}</button></div>
    <div class="note">用 Google 進來的話不需要密碼。<b>還是需要邀請碼</b>——登入之後再輸入。</div>
    <!-- 2026-09-01：寄信接好之後，忘記密碼改成自助為主、組織信箱為輔。
         **組織信箱那條不要刪** —— 自助那條路需要「還記得自己用哪個 email」，
         而連 email 都想不起來的人（換過信箱、當初用學校信箱註冊）沒有別的出口。
         一條自助路徑蓋不住所有情況，留著人工那條的成本只是一行字。 -->
    ${up ? "" : `<div class="note">忘記密碼？<button class="link" data-act="switch-auth" data-m="forgot">寄一封重設連結給我</button><br>連 email 也想不起來的話，寄信到 beyondtaiwan2020@gmail.com。</div>`}
  </div>`;
}

// 登入了，但還不是幹部（規格 §3-5）。
//
// 這一頁在階段 5 之前不存在，因為在那之前「能登入」等於「是幹部」——
// 邀請碼擋在註冊那一關。門移到升級之後，就會有一種人是登入著卻什麼都看不到的：
// 用 Google 進來的新人、或還沒輸入邀請碼的人。**沒有這一頁的話他們會看到
// 一本沒有任何活動格子的空護照**，那是 RLS 正常運作的樣子，但對使用者來說像壞掉。
//
// ⚠ 這一頁的位置是暫時的。規格 §2-2 把升級入口放在 /app/，而 /app/ 是階段 7 才做。
//    階段 7 要把這一頁搬過去，護照就回到「只有幹部看得到」的單純狀態。
//
// 邀請碼那格的 autocapitalize / autocorrect / spellcheck 全部關掉，理由跟
// authHTML 那格一模一樣（見它上面那段註解）：**大小寫已經不是理由**，
// 資料庫兩邊都套 upper(btrim(...))；留著是為了擋 autocorrect 把使用者打的字
// 換成別的字 —— 那是使用者看不見的竄改，資料庫救不了。
export function notCadreHTML(msg) {
  return `<div class="card">
    <h2>你還不是 BT 幹部</h2>
    <div class="sub">護照目前只開放給幹部。你已經登入了，但還沒有升級。</div>
    ${msg ? `<div class="wnote" style="margin:0 0 16px">${esc(msg)}</div>` : ""}
    <label><i>邀請碼 / Invite code</i><input id="ci" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="跟組長拿"></label>
    <div class="note" style="margin:0 0 14px">升級之後，你的姓名、團隊、大頭照與蓋章紀錄會出現在全體進度牆上，<b>其他 BT 幹部看得到，包含你的大頭照</b>。你寫的心得和上傳的活動照片只留在你自己的護照裡，<b>其他幹部看不到</b>。</div>
    <div class="stack">
      <button class="btn" data-act="do-claim">我是幹部，我有邀請碼</button>
    </div>
    <!-- 2026-09-08（批 2）：這一頁不再是學員的預設畫面，是他從自己的帳號頁
         點「我是 BT 幹部，我有邀請碼」才會進來的。所以要有一條回得去的路 ——
         沒有的話，一個好奇點進來的學員只剩下登出這個出口。 -->
    <div class="nav"><button class="link" data-act="back-account">我不是幹部，回我的帳號</button></div>
    <div class="nav"><button class="link" data-act="signout">登出</button></div>
    <div class="note">還不是幹部也沒關係，這個帳號留著。學員的功能用的是同一個帳號。</div>
  </div>`;
}
// 登入之後的選單。**這一頁不放還不存在的東西。**
// 時間看板（階段 8）現在沒有，所以這裡就沒有它的入口 ——
// 灰掉的「敬請期待」看起來像壞掉的功能，而且會有人來問什麼時候好。
export function menuHTML(who) {
  return `<div class="card">
    <h2>Beyond Taiwan</h2>
    <div class="sub">${who ? esc(who) : ""}</div>
    <div class="menu">${featuresFor("cadre").map(f => `
      <a class="mitem" href="${f.href}">
        <b>${esc(f.title)}</b>
        <span>${esc(f.desc)}</span>
      </a>`).join("")}
    </div>
    <div class="row" style="margin-top:22px">
      <button class="btn ghost sm" data-act="signout">登出</button>
    </div>
  </div>`;
}

// 連不上資料庫時的畫面。跟護照那一份是**兩份**，不是共用的：
// 護照那份說「你的資料都還在」，那句話在登入頁上沒有意義（他還沒有資料）。
// 文案不同，所以是不同的東西，不要為了少一份檔案硬合起來。
export function downHTML() {
  return `<div class="card">
    <h2>資料庫休眠中</h2>
    <div class="wnote" style="margin:16px 0 0">
      現在連不上資料庫，所以沒有辦法登入。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。
    </div>
    <div class="row" style="margin-top:18px"><button class="btn ghost" data-act="retry">再試一次</button></div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 學員（批 2，2026-09-08）
// ═══════════════════════════════════════════════════════════════════════
// 在這一批之前，`role !== "cadre"` 的人一律看到 notCadreHTML（「你還不是幹部」）。
// 那一頁現在還在，但**不再是預設的畫面** —— 它變成學員頁上的一個小入口。
//
// 為什麼要換：學員不是「還沒升級的幹部」。他來這裡是為了拿資源、報名活動，
// 而「你還不是 BT 幹部」對他來說是一句沒有意義的拒絕。
// 同一個帳號，兩種人，兩個畫面。
//
// GOALS.md 目標 4 在 2026-09-07 拍板：這一屆要做 student。

export const GRADES = ["高一", "高二", "高三", "已畢業", "其他"];

// 資料齊了沒有。**姓名與學校是必要的，年級不是。**
// 年級可以是「其他」，但那也要他自己選過 —— 所以三個都要有值才算齊。
// 這一支是純函式，測得到；render 只問它，不要在別的地方再判斷一次。
export function profileComplete(p) {
  if (!p) return false;
  return !!(String(p.name || "").trim() && String(p.school || "").trim() && String(p.grade || "").trim());
}

// ── 補完資料 ──────────────────────────────────────────────────────────
// **這一頁擋在學員頁前面。**
//
// 為什麼不在註冊表單上問這四件事：
//   1. 用 Google 進來的人根本沒有經過註冊表單。兩條路各問一次，
//      就會有兩份要維護的欄位與兩種漏掉的方式。
//   2. email + 密碼註冊之後要先收確認信才登得進來，那個時間點還寫不進 profiles。
//      硬要的話得把資料塞進 auth 的 metadata 再讓 trigger 抄過去，
//      那是一條只為了省一個畫面而多出來的路。
//   3. 這一頁看得到脈絡：**電子報那個勾在這裡才有意義**，
//      因為旁邊就寫著我們會拿它做什麼。夾在註冊表單的密碼欄下面沒有人會讀。
//
// ⚠ 電子報那個勾**預設不打**。預設打勾等於沒有同意。
export function completeHTML(p, msg, busy) {
  const v = k => esc(p && p[k] ? p[k] : "");
  return `<div class="card">
    <h2>還差幾個欄位</h2>
    <div class="sub">填完就可以用了。之後隨時改得動。</div>
    ${msg ? `<div class="wnote" style="margin:0 0 16px">${esc(msg)}</div>` : ""}
    <label><i>你的名字</i><input id="pn" value="${v("name")}" autocomplete="name" placeholder="王小明"></label>
    <!-- list 指到一份 506 間學校的自動完成清單，資料在 app/schools.json，
         由 scripts/schools/build.mjs 從教育部的名錄產生。
         **datalist 不是下拉選單，它只是建議** —— 清單外的學校照樣打得進去，
         那是刻意的：高職、海外、實驗教育的學生也要填得進來。
         清單是等到第一次點這一格才去載的（見 main.js），
         所以沒有 JavaScript 或還沒載完的時候，它就是一個普通的文字欄位。 -->
    <label><i>就讀學校</i><input id="ps" list="schools" value="${v("school")}"
      autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
      placeholder="打兩個字就會跳出來"></label>
    <datalist id="schools"></datalist>
    <label><i>年級</i><select id="pg">
      <option value="">請選擇</option>
      ${GRADES.map(g => `<option${p && p.grade === g ? " selected" : ""}>${esc(g)}</option>`).join("")}
    </select></label>
    <label class="check">
      <input id="pnl" type="checkbox"${p && p.newsletter ? " checked" : ""}>
      <span>我願意收 BT 的活動通知與資源更新。<br>
        每次寄信都有取消訂閱的連結，你隨時可以停掉。不勾也不影響你使用這個帳號。</span>
    </label>
    <div class="stack">
      <button class="btn" data-act="save-profile" ${busy ? "disabled" : ""}>${busy ? "存檔中…" : "存起來"}</button>
    </div>
    <div class="note">我們問學校與年級，是為了知道要把活動辦在哪裡、辦給誰。
      <b>不會公開，也不會給任何第三方。</b>完整寫在<a href="../privacy/">隱私政策</a>。</div>
    <div class="nav"><button class="link" data-act="signout">登出</button></div>
  </div>`;
}


// ── 我的申請（批 3，2026-09-08）────────────────────────────────────────
// 申請人最想知道的只有一件事：**我到哪一關了。**
// 這一支就是那句話，而且是純函式，測得到。
//
// ⚠ 「已收到」後面那個日期是**表單上填的預計通知日**，沒填就只有「已收到」。
// 不要編一個日期出來 —— 一個沒有根據的日期比沒有日期傷得更重，
// 因為他會照那個日期來問。
export function statusLine(app) {
  const by = app.notify_by ? fmtDay(app.notify_by) : "";
  switch (app.status) {
    case "interview": return "邀請你面試";
    case "accepted":  return "錄取了";
    case "rejected":  return "這次沒有錄取";
    default:          return by ? `已收到，${by} 前會通知你` : "已收到";
  }
}

// yyyy 年 m 月 d 日。**不要用 toLocaleDateString** ——
// 它會跟著使用者的系統語言變，同一個畫面上會出現兩種寫法。
//
// ⚠ **只有日期的字串不可以交給 new Date()。**
// "2026-12-15" 會被當成 UTC 午夜，再用本地的 getDate() 讀出來，
// 在台灣以西的時區就會少一天 —— 而畫面上那是一個看起來完全正常的日期。
// 2026-09-08 實測：headless Chrome（美西時區）把 12/15 畫成 12/14。
// 帶時間的字串（timestamptz）就該用本地時間讀，那是對的，所以只有日期要特判。
export function fmtDay(v) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
    const [y, m, d] = String(v).split("-").map(Number);
    return `${y} 年 ${m} 月 ${d} 日`;
  }
  const d = new Date(v);
  if (isNaN(d)) return "";
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

// ── 學員的 dashboard ──────────────────────────────────────────────────
// ⚠ **這一頁不放還不存在的東西。**（跟 menuHTML 同一條規矩，理由見它上面那段。）
// 批 3 會在這裡長出「我的申請」與「現在開放的申請」，批 5 會長出資源。
// 在那之前不放灰掉的入口 —— 點不下去的東西看起來像壞掉，而且會有人來問。
export function studentHTML(p, msg, apps, opens) {
  const row = (k, val) => `<li><b>${esc(k)}</b>${
    val ? `<span>${esc(val)}</span>` : `<span class="empty-v">還沒填</span>`}</li>`;

  // 我的申請。有申請才畫這一區 —— 沒有的時候畫一個空的區塊，
  // 只是在告訴他「這裡本來應該有東西」。
  const mine = (apps || []).length ? `
    <h3 class="sec-h">我的申請</h3>
    <ul class="applist">${apps.map(a => `<li>
      <b>${esc(a.title)}</b>
      <span class="st st-${esc(a.status)}">${esc(statusLine(a))}</span>
      ${a.status === "interview" && a.interview_url
        ? `<div class="st-more"><a href="${esc(a.interview_url)}">約面試時間</a>
             <span class="empty-v">你還沒約時間</span></div>` : ""}
    </li>`).join("")}</ul>` : "";

  // 現在開放的。已經申請過的不再列出來（列出來他會以為可以再申請一次）。
  const applied = new Set((apps || []).map(a => a.form_id));
  const left = (opens || []).filter(f => !applied.has(f.id));
  const now = left.length ? `
    <h3 class="sec-h">現在開放</h3>
    <ul class="applist">${left.map(f => `<li>
      <b>${esc(f.title)}</b>
      <div class="st-more"><a href="../apply/?f=${encodeURIComponent(f.id)}">看看這一個</a></div>
    </li>`).join("")}</ul>` : "";

  return `<div class="card">
    <h2>${esc((p && p.name) || "你的帳號")}</h2>
    <div class="sub">Beyond Taiwan</div>
    ${msg ? `<div class="wnote" style="margin:0 0 16px">${esc(msg)}</div>` : ""}
    ${mine}
    ${now}
    <h3 class="sec-h">我的資料</h3>
    <ul class="kv">
      ${row("學校", p && p.school)}
      ${row("年級", p && p.grade)}
      ${row("活動通知", p && p.newsletter ? "有訂閱" : "沒有訂閱")}
    </ul>
    <div class="row">
      <button class="btn ghost sm" data-act="edit-profile">改我的資料</button>
    </div>
    ${mine || now ? "" : `<div class="note">下一場探索營、下一輪導生配對都會先公布在
      <a href="https://www.instagram.com/beyondtaiwan/">Instagram</a>，
      也可以先看<a href="../apply/">現在開放什麼</a>。</div>`}
    <div class="note"><button class="link" data-act="show-claim">我是 BT 幹部，我有邀請碼</button></div>
    <div class="nav"><button class="link" data-act="signout">登出</button></div>
    <!-- 刪除帳號放在最後、用最輕的樣式，但**一定要在這一頁上找得到**。
         2026-09-07 Paul 決定申請資料不設保存期限（一直留著），
         那個決定的對價就是當事人隨時拿得回控制權。
         寫在隱私政策裡叫人來信不算數 —— 那是把成本轉嫁給他。 -->
    <div class="note" style="margin-top:26px;border-top:1px solid rgba(16,42,134,.13);padding-top:16px">
      <button class="link" data-act="ask-delete">刪除我的帳號與所有資料</button>
    </div>
  </div>`;
}

// 刪除帳號的確認。**打字確認，不是按兩次。**
// 按兩次擋不住誤按，因為誤按的人第二次也會按。要他打字才會停下來讀。
export function deleteHTML(msg, busy) {
  return `<div class="card">
    <h2>刪除帳號</h2>
    <div class="sub">這個動作沒有辦法復原。</div>
    ${msg ? `<div class="wnote" style="margin:0 0 16px">${esc(msg)}</div>` : ""}
    <div class="wnote">刪掉的東西包括：你的姓名、學校、年級、訂閱設定，
      以及你送出過的每一份申請與裡面的答案。</div>
    <p style="font-size:14px;line-height:1.65;margin:0 0 16px">
      已經寄給你的信不會消失，那些在你自己的信箱裡。
      如果你已經報名了某一場活動，刪掉帳號等於退出那一場。</p>
    <label><i>確定的話，在下面打「刪除」兩個字</i><input id="dc" autocomplete="off"
      autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="刪除"></label>
    <div class="stack">
      <button class="btn" data-act="do-delete" ${busy ? "disabled" : ""}>${busy ? "刪除中…" : "永久刪除我的帳號"}</button>
    </div>
    <div class="nav"><button class="link" data-act="back-account">先不要，回我的帳號</button></div>
  </div>`;
}
