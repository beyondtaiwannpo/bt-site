// 登入頁與學員帳號 的字典：畫面上每一句中文與英文並排（2026-10-19，登入後頁面的中英切換）。
// 做法與理由見 docs/2026-10-19-後台中英切換.md，怎麼加一句見 README「登入後頁面的中英切換」。
//
// **每一個登入後的資料夾各有一支 strings.js**，不互相 import（跟 esc() 同一條規矩）。
// COMMON 那一段六份一模一樣（test/lang.test.mjs 逐字比對），MINE 是這一頁自己的。機制那一段跟後台四份也一樣。
//
// 規矩：
//   - 鍵是英文、用點分段（畫面.用途）。中文與英文寫在同一行，加一句不用讀程式。
//   - 鍵以 err. 開頭的是「沒做成」的訊息。
//   - 帶數字用 {n}；英文單複數用 {n:form|forms}（1 的時候取前面，其他取後面）。中文沒有單複數，照常寫。
//   - 值裡面可以有 HTML（<b>、<a>），跟原本寫在樣板裡一樣。**使用者填的字要先 esc() 再餵進 {}**。

export const COMMON = {
  "loading":          { zh: "載入中…", en: "Loading…" },
  "common.save":      { zh: "儲存", en: "Save" },
  "common.saving":    { zh: "存檔中…", en: "Saving…" },
  "common.cancel":    { zh: "取消", en: "Cancel" },
  "common.retry":     { zh: "再試一次", en: "Try again" },
  "common.signout":   { zh: "登出", en: "Sign out" },
  "common.noName":    { zh: "（沒有名字）", en: "(no name)" },
  "common.back":      { zh: "回入口", en: "Back to the entrance" },
  "lang.label":       { zh: "語言", en: "Language" },
  "punct.list":       { zh: "、", en: ", " },
  // 版本提示與自動儲存（2026-11-06）。九份 strings.js 的 COMMON 要一模一樣（test/lang.test.mjs、test/admin-hub.test.mjs 逐字比對）。
  "ver.newer":        { zh: "網站有新版本了，重新整理一下就會換成新的。", en: "A newer version is live. Reload to get it." },
  "ver.reload":       { zh: "重新整理", en: "Reload" },
  "auto.saving":      { zh: "存檔中…", en: "Saving…" },
  "auto.saved":       { zh: "存好了", en: "Saved" },
  "auto.hint":        { zh: "改了就存", en: "saves as you change it" },
  "auto.failed":      { zh: "沒存進去，剛打的字還在，再試一次。", en: "Not saved. What you typed is still here; try again." },
};

export const MINE = {
  // 年級。值存在資料庫裡是中文，英文只是畫面上的顯示。
  "grade.高一":       { zh: "高一", en: "Grade 10" },
  "grade.高二":       { zh: "高二", en: "Grade 11" },
  "grade.高三":       { zh: "高三", en: "Grade 12" },
  "grade.已畢業":     { zh: "已畢業", en: "Graduated" },
  "grade.其他":       { zh: "其他", en: "Other" },
  // 忘記密碼
  "fp.title":         { zh: "忘記密碼", en: "Forgot password" },
  "fp.sub":           { zh: "輸入你註冊時用的 email，我們寄一封重設連結給你。", en: "Enter the email you signed up with and we will send you a reset link." },
  "fp.sending":       { zh: "寄出中…", en: "Sending…" },
  "fp.send":          { zh: "寄出重設連結", en: "Send reset link" },
  "fp.back":          { zh: "回登入", en: "Back to sign in" },
  "fp.google":        { zh: "<b>用 Google 登入的話不需要密碼</b>，回登入頁直接按那顆 Google 按鈕就好。這一頁只對「用 email + 密碼註冊」的人有用。", en: "<b>If you sign in with Google you do not need a password.</b> Go back and press the Google button. This page is only for people who signed up with email and password." },
  "fp.noEmail":       { zh: "連 email 也想不起來？寄信到 beyondtaiwan2020@gmail.com，我們幫你找。", en: "Cannot remember the email either? Write to beyondtaiwan2020@gmail.com and we will look it up." },
  // 寄出之後
  "sent.title":       { zh: "信寄出去了", en: "Email sent" },
  "sent.sub":         { zh: "如果 <b>{email}</b> 有帳號，我們寄了一封重設連結給它。", en: "If <b>{email}</b> has an account, we sent it a reset link." },
  "sent.thatEmail":   { zh: "那個信箱", en: "that address" },
  "sent.note":        { zh: "沒收到的話，先看一下垃圾郵件匣。連結大約一小時內有效，過期了再回來要一次就好。", en: "If it does not arrive, check your spam folder. The link works for about an hour. If it expires, come back and ask for another." },
  "sent.help":        { zh: "試了幾次都收不到？寄信到 beyondtaiwan2020@gmail.com，我們直接幫你處理。", en: "Still nothing after a few tries? Write to beyondtaiwan2020@gmail.com and we will sort it out." },
  // 註冊完等確認信
  "check.title":      { zh: "去收一封信", en: "Check your email" },
  "check.sub":        { zh: "我們寄了一封確認信到 <b>{email}</b>。點裡面的連結就完成註冊。", en: "We sent a confirmation email to <b>{email}</b>. Click the link inside to finish signing up." },
  "check.yourEmail":  { zh: "你的信箱", en: "your inbox" },
  "check.note":       { zh: "沒收到的話先看垃圾郵件匣。信可能要等一兩分鐘。", en: "If it does not arrive, check your spam folder. It can take a minute or two." },
  "check.done":       { zh: "我點過了，去登入", en: "I clicked it, take me to sign in" },
  "check.help":       { zh: "一直收不到？寄信到 beyondtaiwan2020@gmail.com，我們直接幫你處理。", en: "Still nothing? Write to beyondtaiwan2020@gmail.com and we will sort it out." },
  // 登入與註冊
  "auth.signup":      { zh: "註冊", en: "Sign up" },
  "auth.signin":      { zh: "登入", en: "Sign in" },
  "auth.subUp":       { zh: "先開帳號，之後再輸入邀請碼升級成幹部。", en: "Create an account first. Enter an invite code later to become a cadre." },
  "auth.subIn":       { zh: "用你註冊時的 email 登入。", en: "Sign in with the email you signed up with." },
  "auth.pw":          { zh: "密碼 / Password", en: "Password" },
  "auth.pwMin":       { zh: "（至少 6 個字）", en: " (at least 6 characters)" },
  "auth.busy":        { zh: "處理中…", en: "Working…" },
  "auth.google":      { zh: "用 Google 登入", en: "Sign in with Google" },
  // 邀請連結（2026-10-29）
  "inv.sub":          { zh: "你收到的是邀請連結。登入或註冊之後會自動完成，不用打碼。", en: "You arrived from an invite link. Sign in or sign up and the rest happens by itself; no code to type." },
  "inv.banner":       { zh: "這封邀請是寄給 <b>{email}</b> 的，請用那個 email 登入。", en: "This invite was sent to <b>{email}</b>. Sign in with that email." },
  "inv.bannerNoHint": { zh: "請用收到邀請信的那個 email 登入。", en: "Sign in with the email the invite was sent to." },
  "inv.bannerClaimed":{ zh: "這個邀請已經用過了。直接登入就好。", en: "This invite has already been used. Just sign in." },
  "inv.bannerDead":   { zh: "這個邀請已經過期或被撤銷了。請邀請你的人重寄一封。", en: "This invite has expired or been revoked. Ask the person who invited you to resend it." },
  "inv.google":       { zh: "用 Google 繼續（選收信的那個帳號）", en: "Continue with Google (pick the account that got the email)" },
  "inv.orEmail":      { zh: "或用 email 加密碼：", en: "Or with email and password:" },
  "inv.googleNote":   { zh: "用 Google 的話不需要密碼，也<b>不需要邀請碼</b>，登入完就是你的身分。", en: "With Google you need no password and <b>no invite code</b>; your role is applied when you sign in." },
  "inv.wrongEmail":   { zh: "這封邀請是寄給 {email} 的，你現在登入的不是那個帳號。登出之後用那個 email 再登入一次。", en: "This invite was sent to {email}, and you are signed in with a different account. Sign out and sign in with that email." },
  "inv.expired":      { zh: "這個邀請過期了（30 天）。請邀請你的人重寄一封。", en: "This invite has expired (30 days). Ask the person who invited you to resend it." },
  "inv.revoked":      { zh: "這個邀請被撤銷了。有問題請問邀請你的人。", en: "This invite was revoked. Ask the person who invited you." },
  "inv.recordClaimed":{ zh: "這個邀請對應的名單紀錄已經被別人認領了。請問邀請你的人。", en: "The roster record for this invite has already been claimed by someone else. Ask the person who invited you." },
  "inv.used":         { zh: "這個邀請已經用過了。", en: "This invite has already been used." },
  "auth.haveAccount": { zh: "我已經有帳號了", en: "I already have an account" },
  "auth.noAccount":   { zh: "還沒有帳號，要註冊", en: "No account yet, sign up" },
  "auth.googleNote":  { zh: "用 Google 進來的話不需要密碼。<b>還是需要邀請碼</b>——登入之後再輸入。", en: "With Google you do not need a password. <b>You still need an invite code</b>, entered after you sign in." },
  "auth.forgot":      { zh: "忘記密碼？", en: "Forgot your password?" },
  "auth.sendReset":   { zh: "寄一封重設連結給我", en: "Send me a reset link" },
  "auth.noEmail":     { zh: "連 email 也想不起來的話，寄信到 beyondtaiwan2020@gmail.com。", en: "If you cannot remember the email either, write to beyondtaiwan2020@gmail.com." },
  // 還不是幹部
  "nc.title":         { zh: "你還不是 BT 幹部", en: "You are not a BT cadre yet" },
  "nc.sub":           { zh: "護照只開放給幹部與實習生。你已經登入了，但還沒有升級。", en: "The passport is only for cadres and interns. You are signed in but not upgraded yet." },
  "nc.code":          { zh: "邀請碼 / Invite code", en: "Invite code" },
  "nc.codePh":        { zh: "跟組長或 BT 拿", en: "Ask your team lead or BT" },
  "nc.note":          { zh: "升級之後，你的姓名、團隊、大頭照與蓋章紀錄會出現在全體進度牆上，<b>其他 BT 幹部看得到，包含你的大頭照</b>。你寫的心得和上傳的活動照片只留在你自己的護照裡，<b>其他幹部看不到</b>。", en: "After upgrading, your name, team, avatar and stamps appear on the progress wall, <b>visible to other BT cadres, including your avatar</b>. The notes you write and the photos you upload stay in your own passport. <b>Other cadres cannot see them</b>." },
  "nc.claim":         { zh: "我是幹部、校友或實習生，我有邀請碼", en: "I am a cadre, alumnus or intern and I have an invite code" },
  "nc.back":          { zh: "我不是幹部，回我的帳號", en: "I am not a cadre, back to my account" },
  "nc.keep":          { zh: "還不是幹部也沒關係，這個帳號留著。學員的功能用的是同一個帳號。", en: "Not being a cadre is fine. Keep this account. Student features use the same one." },
  // 連不上
  "down.title":       { zh: "資料庫休眠中", en: "Database is asleep" },
  "down.lede":        { zh: "現在連不上資料庫，所以沒有辦法登入。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。", en: "We cannot reach the database right now, so you cannot sign in. Email beyondtaiwan2020@gmail.com to have it woken up." },
  // 補完資料
  "cp.title":         { zh: "還差幾個欄位", en: "A few more details" },
  "cp.sub":           { zh: "填完就可以用了。之後隨時改得動。", en: "Fill these in and you are set. You can change them any time." },
  "cp.name":          { zh: "你的名字", en: "Your name" },
  "cp.namePh":        { zh: "王小明", en: "Ming Wang" },
  "cp.school":        { zh: "就讀學校", en: "School" },
  "cp.schoolPh":      { zh: "打兩個字就會跳出來", en: "Type two characters to see suggestions" },
  "cp.grade":         { zh: "年級", en: "Grade" },
  "cp.pick":          { zh: "請選擇", en: "Choose" },
  "cp.newsletter":    { zh: "我願意收 BT 的活動通知與資源更新。<br>\n        每次寄信都有取消訂閱的連結，你隨時可以停掉。不勾也不影響你使用這個帳號。", en: "I would like BT's event notices and resource updates.<br>Every email has an unsubscribe link, so you can stop any time. Not ticking does not affect your account." },
  "cp.saving":        { zh: "存檔中…", en: "Saving…" },
  "cp.save":          { zh: "存起來", en: "Save" },
  "cp.why":           { zh: "我們問學校與年級，是為了知道要把活動辦在哪裡、辦給誰。\n      <b>不會公開，也不會給任何第三方。</b>完整寫在<a href=\"../privacy/\">隱私政策</a>。", en: "We ask for your school and grade to know where to hold events and for whom. <b>They are never published or given to any third party.</b> The full text is in the <a href=\"../privacy/\">privacy policy</a>." },
  // 我的申請
  "st.interview":     { zh: "邀請你面試", en: "Invited to interview" },
  "st.accepted":      { zh: "錄取了", en: "Accepted" },
  "st.rejected":      { zh: "這次沒有錄取", en: "Not accepted this time" },
  "st.receivedBy":    { zh: "已收到，{by} 前會通知你", en: "Received. You will hear from us by {by}" },
  "st.received":      { zh: "已收到", en: "Received" },
  "date.ymd":         { zh: "{y} 年 {m} 月 {d} 日", en: "{y}-{mm}-{dd}" },
  // 學員的 dashboard
  "sd.empty":         { zh: "還沒填", en: "not filled in" },
  "sd.mine":          { zh: "我的申請", en: "My applications" },
  "sd.book":          { zh: "約面試時間", en: "Book an interview time" },
  "sd.notBooked":     { zh: "你還沒約時間", en: "You have not booked a time" },
  "sd.open":          { zh: "現在開放", en: "Open now" },
  "sd.look":          { zh: "看看這一個", en: "Take a look" },
  "sd.account":       { zh: "你的帳號", en: "Your account" },
  "sd.me":            { zh: "我的資料", en: "My details" },
  "sd.school":        { zh: "學校", en: "School" },
  "sd.grade":         { zh: "年級", en: "Grade" },
  "sd.news":          { zh: "活動通知", en: "Event notices" },
  "sd.subscribed":    { zh: "有訂閱", en: "subscribed" },
  "sd.unsubscribed":  { zh: "沒有訂閱", en: "not subscribed" },
  "sd.edit":          { zh: "改我的資料", en: "Edit my details" },
  "sd.settings":      { zh: "設定", en: "Settings" },
  "sd.ig":            { zh: "下一場探索營、下一輪導生配對都會先公布在\n      <a href=\"https://www.instagram.com/beyondtaiwan/\">Instagram</a>，\n      也可以先看<a href=\"../apply/\">現在開放什麼</a>。", en: "The next camp and the next round of mentor matching are announced first on <a href=\"https://www.instagram.com/beyondtaiwan/\">Instagram</a>. You can also see <a href=\"../apply/\">what is open now</a>." },
  "sd.claim":         { zh: "我是幹部或校友，我有邀請碼", en: "I am a cadre or alumnus and I have an invite code" },
  "sd.toSettings":    { zh: "要改資料或刪除帳號，到<a href=\"../settings/\">設定</a>。", en: "To change your details or delete your account, go to <a href=\"../settings/\">Settings</a>." },
  // 刪除帳號
  "del.title":        { zh: "刪除帳號", en: "Delete account" },
  "del.sub":          { zh: "這個動作沒有辦法復原。", en: "This cannot be undone." },
  "del.what":         { zh: "刪掉的東西包括：你的姓名、學校、年級、訂閱設定，\n      以及你送出過的每一份申請與裡面的答案。", en: "This deletes your name, school, grade, subscription setting, and every application you submitted with its answers." },
  "del.mail":         { zh: "已經寄給你的信不會消失，那些在你自己的信箱裡。\n      如果你已經報名了某一場活動，刪掉帳號等於退出那一場。", en: "Emails already sent to you stay in your own inbox. If you signed up for an event, deleting your account withdraws you from it." },
  "del.type":         { zh: "確定的話，在下面打「刪除」兩個字", en: "To confirm, type delete below" },
  "del.typePh":       { zh: "刪除", en: "delete" },
  "del.deleting":     { zh: "刪除中…", en: "Deleting…" },
  "del.do":           { zh: "永久刪除我的帳號", en: "Permanently delete my account" },
  "del.no":           { zh: "先不要，回我的帳號", en: "Not now, back to my account" },
  // main.js
  "m.taking":         { zh: "帶你進去…", en: "Taking you in…" },
  "m.takingOver":     { zh: "帶你過去…", en: "Taking you there…" },
  "m.formGone":       { zh: "（表單已經被刪掉）", en: "(form has been deleted)" },
  "m.dup":            { zh: "這個 email 已經有帳號了，直接登入就好。密碼忘記的話下面可以重設。", en: "This email already has an account. Just sign in. If you forgot the password you can reset it below." },
  "m.three":          { zh: "姓名、學校、年級三個都要填。", en: "Fill in all three: name, school and grade." },
  "err.save":         { zh: "存不起來：", en: "Could not save: " },
  "m.typeDelete":     { zh: "要在那一格打「刪除」兩個字才會執行。", en: "Type delete in that box to proceed." },
  "m.deleted":        { zh: "帳號已經刪掉了。謝謝你來過。", en: "Your account has been deleted. Thank you for being here." },
  "m.delFail":        { zh: "刪不掉：", en: "Could not delete: " },
};

export const STRINGS = { ...COMMON, ...MINE };

// ── 下面是機制，四份一模一樣（test/admin-hub.test.mjs 逐字比對）。加句子不用動這裡。 ──
export const LANGS = ["zh", "en"];
export const STORE_KEY = "bt-lang";
let cur = "en";
export function lang() { return cur; }
export function setLang(l) { cur = l === "zh" ? "zh" : "en"; return cur; }

// 開頁時決定語言：網址 ?lang= 先（選擇要跟著人走），再 localStorage（上次選的），都沒有就英文（Paul 2026-10-19）。
// 純函式：search 是 location.search，stored 是 localStorage 裡存的值（讀不到就傳 null）。
export function pickLang(search, stored) {
  const q = new URLSearchParams(search || "").get("lang");
  if (LANGS.includes(q)) return q;
  if (LANGS.includes(stored)) return stored;
  return "en";
}

// 一條連結帶上 ?lang=，放在 # 前面。已經有 ?lang= 的不重複加。
export function withLang(href) {
  const s = String(href || "");
  if (/[?&]lang=/.test(s)) return s;
  const i = s.indexOf("#");
  const base = i < 0 ? s : s.slice(0, i);
  const hash = i < 0 ? "" : s.slice(i);
  return base + (base.includes("?") ? "&" : "?") + "lang=" + cur + hash;
}

// T("鍵") 或 T({ zh, en })，第二個參數是 {n} 這一類要代進去的值。
// 鍵不存在就回鍵本身：畫面上會看到 "forms.title" 這種字，一眼就抓得到漏翻，不會安靜地空白。
export function T(key, vars) {
  const row = typeof key === "object" && key ? key : STRINGS[key];
  if (!row) return String(key);
  let s = row[cur] != null ? row[cur] : (row.en != null ? row.en : row.zh);
  if (vars) {
    s = String(s).replace(/\{(\w+)(?::([^|}]*)\|([^}]*))?\}/g, (_, k, one, many) => {
      const v = vars[k];
      if (one !== undefined) return Number(v) === 1 ? one : many;
      return v == null ? "" : String(v);
    });
  }
  return s;
}

// 訊息是不是「沒做成」那一種：含有任何一句 err. 開頭的句子（中文或英文都算）。
// msgKind() 靠這個決定畫綠的還是橘的。加一句新的錯誤訊息，鍵取 err. 開頭就自動是橘的。
const ERRS = Object.keys(STRINGS).filter(k => k.startsWith("err.")).flatMap(k => [STRINGS[k].zh, STRINGS[k].en]).filter(Boolean);
export function isErr(msg) {
  const s = String(msg || "");
  return ERRS.some(e => s.includes(e));
}
