// 後台「Marketing」那一組的字典（2026-11-26）：畫面上每一句中文與英文並排（2026-10-19，後台中英切換）。
// 做法與理由見 docs/2026-10-19-後台中英切換.md，怎麼加一句見 README「後台的中英切換」。
//
// **四個後台資料夾各有一支 strings.js**，不互相 import（跟 esc()、側欄那一段同一條規矩）。
// COMMON 那一段四份一模一樣（test/admin-hub.test.mjs 逐字比對），MINE 是這一組自己的畫面。
// **六個後台資料夾各有一支 strings.js**（2026-11-08 多了 admin/finance/，2026-11-26 多了 admin/marketing/）。
//
// 規矩：
//   - 鍵是英文、用點分段（畫面.用途）。中文與英文寫在同一行，加一句不用讀程式。
//   - 鍵以 err. 開頭的是「沒做成」的訊息，畫面會把它畫成橘的（isErr 看這個，不看字尾）。
//   - 帶數字用 {n}；英文單複數用 {n:form|forms}（1 的時候取前面，其他取後面）。中文沒有單複數，照常寫。
//   - 值裡面可以有 HTML（<b>、<span>），跟原本寫在樣板裡一樣。**使用者填的字要先 esc() 再餵進 {}**。

export const COMMON = {
  "title":            { zh: "BT 後台", en: "BT Admin" },
  "loading":          { zh: "載入中", en: "Loading" },
  "common.save":      { zh: "存起來", en: "Save" },
  "common.saving":    { zh: "存檔中…", en: "Saving…" },
  "common.cancel":    { zh: "取消", en: "Cancel" },
  "common.edit":      { zh: "改", en: "Edit" },
  "common.delete":    { zh: "刪掉", en: "Delete" },
  "common.retry":     { zh: "再試一次", en: "Try again" },
  "common.noName":    { zh: "（沒有名字）", en: "(no name)" },
  "punct.colon":      { zh: "：", en: ": " },
  "punct.list":       { zh: "、", en: ", " },
  "msg.ok":           { zh: "好了", en: "Done" },
  "msg.err":          { zh: "沒成", en: "Failed" },
  "msg.saved":        { zh: "存好了。", en: "Saved." },
  "msg.deleted":      { zh: "刪掉了。", en: "Deleted." },
  "err.save":         { zh: "存不起來：", en: "Could not save: " },
  "err.delete":       { zh: "刪不掉：", en: "Could not delete: " },
  "err.change":       { zh: "改不了：", en: "Could not change: " },
  // 側欄
  "rail.menu":        { zh: "後台選單", en: "Admin menu" },
  "rail.open":        { zh: "展開後台選單", en: "Open the admin menu" },
  "rail.groups":      { zh: "後台的分組", en: "Admin sections" },
  "rail.lang":        { zh: "語言", en: "Language" },
  "rail.noTeam":      { zh: "還沒填 team", en: "no team yet" },
  "rail.allTeams":    { zh: "全部 team", en: "all teams" },
  "rail.foot":        { zh: "對外七頁（首頁、關於、計畫、做過什麼、合作、團隊、Alumni）的文字在 HTML 檔裡，不在後台。改法見 README「對外的內容頁」。",
                        en: "The seven public pages (home, about, programs, impact, partner, team, alumni) live in HTML files, not here. See README, the section on the public content pages." },
  "board.member":     { zh: "Associate", en: "Associate" },
  "board.director":   { zh: "Director", en: "Director" },
  "board.president":  { zh: "Co-President", en: "Co-President" },
  "why.president":    { zh: "只有 Co-President 進得去", en: "Co-Presidents only" },
  "why.passports":    { zh: "只有被派進護照工作區的人、Co-President 與 Senior Adviser 進得去", en: "Only people assigned to a passport workspace, Co-Presidents and Senior Advisers" },
  "board.senior":     { zh: "Senior Adviser", en: "Senior Adviser" },
  // 2026-10-28 第五級：跟著一個 team 的顧問，職級本身不帶權限（跟 Director、Associate 一樣看指派）。中文畫面叫「顧問」。
  "board.adviser":    { zh: "顧問", en: "Adviser" },
  "why.senior":       { zh: "只有 Co-President 與 Senior Adviser 進得去", en: "Co-Presidents and Senior Advisers only" },
  // 2026-11-08 財務：錢的事。
  "why.finance":      { zh: "只有 Co-President、Senior Adviser 與 Sponsorship 的 Director 進得去", en: "Co-Presidents, Senior Advisers and the Sponsorship Director only" },
  // 2026-11-26 Marketing。
  "why.marketing":    { zh: "只有 Marketing 的人、Co-President 與 Senior Adviser 進得去", en: "Marketing, Co-Presidents and Senior Advisers only" },
  // 走錯地方、連不上
  "notCadre.title":   { zh: "這一頁是給幹部用的", en: "This page is for cadres" },
  "notCadre.lede":    { zh: "你的帳號是學員，後台看不到。", en: "Your account is a student account, so the admin is not available." },
  "notCadre.back":    { zh: "回我的帳號", en: "Back to my account" },
  "down.title":       { zh: "資料庫休眠中", en: "Database is asleep" },
  "down.lede":        { zh: "現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。",
                        en: "We cannot reach the database right now. Email beyondtaiwan2020@gmail.com to have it woken up." },
  "down.detail":      { zh: "資料庫回的是：", en: "The database said: " },
  // 回饋（2026-10-23，第三次重整批 1）：toast 與 inline confirm 用的三句
  "toast.undo":       { zh: "復原", en: "Undo" },
  "toast.close":      { zh: "關掉", en: "Close" },
  "ask.yes":          { zh: "確定", en: "Yes, do it" },
  "grid.byRank":      { zh: "全部（職級）", en: "All (by rank)" },
  // 工作區照 team 分組（2026-10-24）：長名稱講清楚那一格管的是什麼
  "ws.long.passport": { zh: "幹部護照（格子與城市）", en: "Cadre passport (boxes & cities)" },
  "ws.long.intern":   { zh: "實習護照（格子與棋盤）", en: "Intern passport (boxes & board)" },
  "ws.long.apps":     { zh: "申請（表單與審核）", en: "Applications (forms & review)" },
  "ws.long.res":      { zh: "資源", en: "Resources" },
  "ws.long.finance":  { zh: "財務（帳戶、收支、預算）", en: "Finance (accounts, transactions, budget)" },
  "ws.board":         { zh: "整個 BT", en: "Board (whole BT)" },
  "ws.playNote":      { zh: "玩護照是身分帶來的（每位幹部有自己的、每位實習生有自己的），這幾格只管誰能改格子。", en: "Playing a passport comes with the role (every cadre has theirs, every intern theirs); these cells only control who edits the boxes." },
  "ws.availNote":     { zh: "時間看板沒有指派，每位幹部都用。", en: "Availability has no assignments: every cadre uses it." },
  "ws.levelLegend":   { zh: "看：讀得到。改：改得動。管：改得動，而且可以在那個東西自己的頁面上加人、改等級、移出。", en: "View: can read. Edit: can change. Manage: can change, and can add, re-level or remove people on that thing's own page." },
  // 成員分頁（2026-10-23，第三次重整批 3）：對一個工作區是「管」的人，在那個東西自己的頁面上加人、改等級、移出。
  "level.view":       { zh: "看", en: "View" },
  "level.edit":       { zh: "改", en: "Edit" },
  "level.manage":     { zh: "管", en: "Manage" },
  "mp.open":          { zh: "誰在做{name}", en: "Who works on {name}" },
  "mp.title":         { zh: "{name}的成員", en: "People on {name}" },
  "mp.lede":          { zh: "被派進這個工作區的人。你對它是「管」，所以可以加人、改等級、移出。每一筆都記在變動紀錄裡。", en: "People assigned to this workspace. You have Manage on it, so you can add people, change levels and remove them. Every change is written to the change log." },
  "mp.back":          { zh: "回上一頁", en: "Back" },
  "mp.levels":        { zh: "看：讀得到。改：改得動。管：改得動，而且可以在這裡加人、改等級、移出。Co-President 與 Senior Adviser 不用派，本來就全部都有。", en: "View: can read. Edit: can change. Manage: can change, and can add people here, change their level or remove them. Co-Presidents and Senior Advisers need no assignment; they already have everything." },
  "mp.list":          { zh: "現在在裡面的人", en: "People in it now" },
  "mp.name":          { zh: "名字", en: "Name" },
  "mp.level":         { zh: "等級", en: "Level" },
  "mp.remove":        { zh: "移出", en: "Remove" },
  "mp.you":           { zh: "這是你", en: "This is you" },
  "mp.nobody":        { zh: "還沒有人被派進來", en: "Nobody assigned yet" },
  "mp.nobodyHint":    { zh: "底下加第一個人。", en: "Add the first person below." },
  "mp.add":           { zh: "加人", en: "Add people" },
  // 多選加人（2026-10-24）：四份一樣。
  "pk.find":          { zh: "找名字", en: "Find by name" },
  "ma.in":            { zh: "在這個工作區裡（{n}）", en: "In this workspace ({n})" },
  "ma.inNone":        { zh: "還沒有人被派進來。右邊勾人加進來。", en: "Nobody assigned yet. Tick people on the right." },
  "ma.out":           { zh: "還沒在裡面（{n}）", en: "Not yet in ({n})" },
  "ma.shown":         { zh: "篩出 {n} 人", en: "{n} shown" },
  "ma.willAdd":       { zh: "建好就放進去（{n}）", en: "Will be added ({n})" },
  "ma.willAddNone":   { zh: "右邊勾人，建好的時候一起派進去。", en: "Tick people on the right; they are assigned when the workspace is created." },
  "ma.untick":        { zh: "取消", en: "Untick" },
  "ma.redundant":     { zh: "另外有 {n} 筆指派是給靠職級就有一切的人的，多餘。", en: "{n} explicit {n:assignment is|assignments are} for people who already have everything by rank; redundant." },
  "ma.cleanup":       { zh: "清掉這 {n} 筆", en: "Clean up {n}" },
  "msg.cleaned":      { zh: "清掉了 {n} 筆多餘的指派。", en: "Cleaned up {n} redundant {n:assignment|assignments}." },
  "msg.uncleaned":    { zh: "那 {n} 筆指派放回去了。", en: "Put those {n} {n:assignment|assignments} back." },
  "pk.findPh":        { zh: "打名字，中英都可以", en: "Type a name, Chinese or English" },
  "pk.level":         { zh: "等級（勾起來的人都是這一級）", en: "Level (applies to everyone ticked)" },
  "pk.shown":         { zh: "列出 {n} 人，可以加的共 {all} 人", en: "Showing {n} of {all} you can add" },
  "pk.tickAll":       { zh: "全勾看到的", en: "Tick all shown" },
  "pk.untick":        { zh: "全部取消", en: "Untick all" },
  "pk.noneShown":     { zh: "沒有對得上的人。換個名字，或把 team 的篩選拿掉。", en: "Nobody matches. Try another name, or clear the team filter." },
  "pk.noneLeft":      { zh: "每一位幹部都已經在裡面了。", en: "Every cadre is already in." },
  "pk.addN":          { zh: "加 {n} 個人", en: "Add {n} {n:person|people}" },
  "pk.note":          { zh: "右邊只列還沒在裡面的幹部；Co-President 與 Senior Adviser 靠職級就有，列在左邊。空白鍵勾，Enter 送出。", en: "The right column lists cadres not yet in; Co-Presidents and Senior Advisers have it by rank and sit on the left. Space ticks, Enter adds." },
  "msg.mpAssignedN":  { zh: "加了 {n} 個人，等級「{level}」。", en: "Added {n} {n:person|people} as {level}." },
  "msg.mpRemovedN":   { zh: "那 {n} 個人移出了。", en: "Removed those {n} {n:person|people}." },
  "err.mpSome":       { zh: "有人加不進去，前面加好的留著，沒加成的還勾著：", en: "Some could not be added; the rest went in and the failed ones stay ticked: " },
  "msg.mpAssigned":   { zh: "{name} 加進去了（{level}）。", en: "{name} added ({level})." },
  "msg.mpLevel":      { zh: "{name}：{level}。", en: "{name}: {level}." },
  "msg.mpRemoved":    { zh: "{name} 已經移出。", en: "{name} removed." },
  "confirm.mpRemove": { zh: "把 {name} 從這個工作區移出？", en: "Remove {name} from this workspace?" },
  "err.mpLoad":       { zh: "成員載不到：", en: "Could not load the people: " },
  "err.mpPick":       { zh: "先勾至少一個人。", en: "Tick at least one person first." },
  "err.mpNoSuch":     { zh: "名單上沒有這個名字，從提示裡選一個。", en: "No one has that name; pick one from the suggestions." },
  "err.mpAssign":     { zh: "派不進去：", en: "Could not add: " },
  "err.mpRemove":     { zh: "移不出去：", en: "Could not remove: " },
  // 版本提示與自動儲存（2026-11-06）。九份 strings.js 的 COMMON 要一模一樣（test/lang.test.mjs、test/admin-hub.test.mjs 逐字比對）。
  "ver.newer":        { zh: "網站有新版本了，重新整理一下就會換成新的。", en: "A newer version is live. Reload to get it." },
  "ver.reload":       { zh: "重新整理", en: "Reload" },
  "ver.tag":          { zh: "更新", en: "Update" },
  "auto.saving":      { zh: "存檔中…", en: "Saving…" },
  "auto.saved":       { zh: "存好了", en: "Saved" },
  "auto.hint":        { zh: "改了就存", en: "saves as you change it" },
  "auto.failed":      { zh: "沒存進去，剛打的字還在，再試一次。", en: "Not saved. What you typed is still here; try again." },
};

export const MINE = {
  // 進不去
  "noAccess.title":   { zh: "Marketing 這一區只有 Marketing 的人看得到", en: "This area is for the Marketing team" },
  "noAccess.lede":    { zh: "要被派進 Marketing 的資源工作區或行銷需求單工作區（任何等級），或是 Co-President、Senior Adviser。你是 Marketing 卻進不來，請 Co-President 到「人與權限」把你加進去。", en: "You need to be in the Marketing resources workspace or the Marketing requests workspace (any level), or be a Co-President or Senior Adviser. If you are on Marketing and still cannot get in, ask a Co-President to add you under People." },
  "noAccess.back":    { zh: "回後台首頁", en: "Back to admin home" },
  // Instagram 連線（批 1）
  "ig.title":         { zh: "Instagram", en: "Instagram" },
  "ig.lede":          { zh: "網站有沒有接上 BT 的 Instagram 帳號。接上之後，貼文成效與大學介紹貼文會從這裡開始。", en: "Whether the site is connected to BT's Instagram account. Post results and college intro posts will build on this connection." },
  "ig.check":         { zh: "再檢查一次", en: "Check again" },
  "ig.checking":      { zh: "檢查中…", en: "Checking…" },
  "ig.off.title":     { zh: "還沒接上 Instagram", en: "Instagram is not connected yet" },
  "ig.off.body":      { zh: "要先在 Meta 開一個 app、拿一張通行證，放進 Supabase 的 Vault（名字叫 INSTAGRAM_TOKEN）。用 BT 主帳號做，大約 45 分鐘，步驟寫在設定文件裡。做完回來按「再檢查一次」，或等明天自動檢查。", en: "Someone needs to create a Meta app, get an access token and put it in Supabase Vault under the name INSTAGRAM_TOKEN. Use the BT main account. It takes about 45 minutes; the steps are in the setup doc. Then come back and press Check again, or wait for tomorrow's automatic check." },
  "ig.off.who":       { zh: "Marketing 的人不用做這一步，請 Co-President 處理。", en: "Marketing members do not need to do this. Ask a Co-President." },
  "ig.doc":           { zh: "打開設定文件", en: "Open the setup doc" },
  "ig.account":       { zh: "帳號", en: "Account" },
  "ig.type":          { zh: "帳號類型", en: "Account type" },
  "ig.type.BUSINESS": { zh: "商業帳號", en: "Business" },
  "ig.type.MEDIA_CREATOR": { zh: "創作者帳號", en: "Creator" },
  "ig.followers":     { zh: "粉絲", en: "Followers" },
  "ig.posts":         { zh: "貼文", en: "Posts" },
  "ig.checked":       { zh: "最後檢查", en: "Last checked" },
  "ig.never":         { zh: "還沒檢查過", en: "Not checked yet" },
  "ig.token":         { zh: "通行證", en: "Access token" },
  "ig.token.until":   { zh: "用到 {date}", en: "Valid until {date}" },
  "ig.token.about":   { zh: "大約用到 {date}（人手放進去的，確切日期要等第一次自動換新才知道）", en: "Valid until about {date} (added by hand; the exact date is known after the first automatic renewal)" },
  "ig.token.auto":    { zh: "剩不到 50 天時網站會自己換一張新的，正常情況不會過期。", en: "The site renews it automatically when fewer than 50 days are left, so it should never expire." },
  "ig.token.soon":    { zh: "通行證快過期了，自動換新一直沒成功。請 Co-President 照設定文件重拿一張。", en: "The token expires soon and automatic renewal keeps failing. Ask a Co-President to get a new one using the setup doc." },
  "ig.token.dead":    { zh: "不能用了，見下面", en: "Not working, see below" },
  "ig.token.gone":    { zh: "通行證已經過期。請 Co-President 照設定文件重拿一張放進 Vault。", en: "The token has expired. Ask a Co-President to put a new one in Vault using the setup doc." },
  "ig.err.title":     { zh: "最近一次沒接通", en: "The last check failed" },
  "ig.err.190":       { zh: "Instagram 說通行證不能用了（過期、被撤銷，或帳號改了密碼）。請 Co-President 照設定文件重拿一張放進 Vault。", en: "Instagram says the token no longer works (expired, revoked, or the account password changed). Ask a Co-President to put a new one in Vault using the setup doc." },
  "ig.err.net":       { zh: "連不上 Instagram，可能只是那時候網路不穩。明天會自己再試一次。", en: "Could not reach Instagram, probably a temporary network problem. It will try again tomorrow." },
  "ig.err.other":     { zh: "Instagram 回了一個沒看過的錯誤。把下面這一行傳給負責網站的人：", en: "Instagram returned an unfamiliar error. Send this line to whoever looks after the site:" },
  "ig.refreshErr":    { zh: "自動換通行證沒成功（舊的那張還能用到過期那天）：", en: "Automatic token renewal failed (the old token still works until it expires):" },
  "ig.cronOff":       { zh: "每天自動檢查還沒開（Supabase 的 pg_cron）。沒開的話，管的人每個月按一次「再檢查一次」，通行證也會換新。", en: "The daily automatic check is not on (pg_cron in Supabase). Without it, a manager pressing Check again once a month also renews the token." },
  "ig.viewOnly":      { zh: "「再檢查一次」只有 Marketing 資源工作區「管」的人、Co-President 與 Senior Adviser 按得到。", en: "Only Marketing resources managers, Co-Presidents and Senior Advisers can press Check again." },
  "ig.next":          { zh: "接下來會在這裡加上：每篇貼文與 Reels 的成效、粉絲成長、大學介紹貼文產生器。", en: "Coming next here: results for each post and Reel, follower growth, and the college intro post generator." },
  // 訊息
  "msg.checked":      { zh: "檢查好了。", en: "Checked." },
  "err.load":         { zh: "載不到 Instagram 的狀態：", en: "Could not load the Instagram status: " },
  "err.check":        { zh: "檢查不了：", en: "Could not check: " },
  "says.notMarketing":{ zh: "你不在 Marketing 的工作區裡。", en: "You are not in a Marketing workspace." },
  "says.notManager":  { zh: "只有 Marketing 資源工作區「管」的人、Co-President 與 Senior Adviser 按得到。", en: "Only Marketing resources managers, Co-Presidents and Senior Advisers can do this." },
  "says.notReady":    { zh: "還沒設定好：Vault 裡沒有 INSTAGRAM_TOKEN。", en: "Not set up yet: there is no INSTAGRAM_TOKEN in Vault." },
  "says.noTable":     { zh: "Instagram 的資料表還不在，要先在 Supabase 跑 2026-11-26-instagram-connect.sql。", en: "The Instagram tables are not there yet. Run 2026-11-26-instagram-connect.sql in Supabase first." },
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
