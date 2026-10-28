// 實習護照 的字典：畫面上每一句中文與英文並排（2026-10-19，登入後頁面的中英切換）。
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
  "ver.tag":          { zh: "更新", en: "Update" },
  "auto.saving":      { zh: "存檔中…", en: "Saving…" },
  "auto.saved":       { zh: "存好了", en: "Saved" },
  "auto.hint":        { zh: "改了就存", en: "saves as you change it" },
  "auto.failed":      { zh: "沒存進去，剛打的字還在，再試一次。", en: "Not saved. What you typed is still here; try again." },
};

export const MINE = {
  // 三種分類。格子的文案在 intern_tasks 表，不翻；這裡只有分類的名字與說明頁那三段。
  "cat.onboard":       { zh: "入門 ONBOARD", en: "ONBOARD" },
  "cat.onboard.short": { zh: "入門", en: "Onboard" },
  "cat.onboard.body":  { zh: "認識 BT、認識帶你的人、第一次開會。這幾格是這一期的起點，第一個月蓋完。", en: "Meet BT, meet the person guiding you, sit in on your first meeting. These boxes are the start of the term. Finish them in the first month." },
  "cat.project":       { zh: "任務 PROJECT", en: "PROJECT" },
  "cat.project.short": { zh: "任務", en: "Project" },
  "cat.project.body":  { zh: "你實際交出去的東西。第一個任務、期中、期末，每交一次蓋一格。", en: "The work you actually hand in. First task, midterm, final. One stamp per delivery." },
  "cat.reflect":       { zh: "反思 REFLECT", en: "REFLECT" },
  "cat.reflect.short": { zh: "反思", en: "Reflect" },
  "cat.reflect.body":  { zh: "寫給自己的。只有你看得到這幾格裡寫了什麼，帶你的人也看不到，所以可以誠實寫。", en: "Written to yourself. Only you can see what is in these boxes, not even the person guiding you, so you can be honest." },
  // 子欄、翻頁
  "bar.wall":          { zh: "實習生進度牆", en: "Intern progress wall" },
  "bar.sample":        { zh: "樣書", en: "Sample" },
  "bar.mine":          { zh: "我的護照", en: "My passport" },
  "bar.wallShort":     { zh: "進度牆", en: "Progress wall" },
  "bar.stamps":        { zh: "Stamps collected", en: "Stamps collected" },
  "page.id":           { zh: "資料頁", en: "Details" },
  "page.guide":        { zh: "怎麼用", en: "How to use" },
  "nav.prev":          { zh: "← 前一頁", en: "← Previous" },
  "nav.next":          { zh: "下一頁 →", en: "Next →" },
  // 資料頁
  "sample.name":       { zh: "實習生姓名", en: "Intern name" },
  "id.avatar":         { zh: "大頭照", en: "Avatar" },
  "id.upload":         { zh: "點此上傳<br>大頭照", en: "Tap to upload<br>an avatar" },
  "id.title":          { zh: "持照人資料", en: "Holder details" },
  "id.changeAvatar":   { zh: "到設定換大頭照", en: "Change the avatar in Settings" },
  "id.type":           { zh: "Type / 類別", en: "Type" },
  "id.code":           { zh: "Code / 代碼", en: "Code" },
  "id.no":             { zh: "Passport No. / 護照號碼", en: "Passport No." },
  "id.issue":          { zh: "Date of issue / 核發日", en: "Date of issue" },
  "id.name":           { zh: "Name / 姓名", en: "Name" },
  "id.term":           { zh: "Term / 屆別", en: "Term" },
  "id.noTerm":         { zh: "還沒開這一屆", en: "No term opened yet" },
  "id.sampleNote":     { zh: "這是樣書：格子是目前這一屆的，人是假的，章蓋不了。intern 看到的就是這個樣子。", en: "This is the sample: the boxes are this term's, the person is made up, and you cannot stamp. This is what interns see." },
  "id.edit":           { zh: "編輯資料", en: "Edit details" },
  // 格子
  "slot.cta":          { zh: "蓋章 →", en: "Stamp →" },
  "flip.back":         { zh: "翻到背面", en: "Flip to the back" },
  "flip.front":        { zh: "翻到正面", en: "Flip to the front" },
  // 說明頁
  "guide.title":       { zh: "怎麼用這本護照", en: "How to use this passport" },
  "guide.note":        { zh: "格子由 Internship team 定，做完一件就蓋一個章。心得與照片只有你看得到；你的名字、大頭照跟蓋了哪幾格，Internship team 與同一期的 intern 看得到。", en: "The Internship team sets the boxes. Finish one thing, stamp one box. Only you can see your notes and photos. Your name, avatar and which boxes you stamped are visible to the Internship team and the interns in your term." },
  // 進度牆
  "wall.loading":      { zh: "正在讀取全體進度…", en: "Loading everyone's progress…" },
  "wall.title":        { zh: "實習生進度牆", en: "Intern progress wall" },
  "wall.error":        { zh: "進度牆讀不到。按下面的重新整理再試一次{own}。", en: "Could not load the wall. Press refresh below to try again{own}." },
  "wall.errorOwn":     { zh: "，你自己的護照不受影響", en: ". Your own passport is not affected" },
  "wall.refresh":      { zh: "重新整理", en: "Refresh" },
  "wall.note":         { zh: "這面牆 Internship team 的幹部與這一期的 intern 看得到：名字、大頭照與蓋章紀錄。心得和照片不會出現在這裡，誰都看不到。", en: "Internship team cadres and this term's interns can see this wall: names, avatars and stamps. Notes and photos do not appear here. Nobody can see them." },
  "wall.empty":        { zh: "還沒有人蓋章。", en: "Nobody has stamped yet." },
  "wall.recent":       { zh: "最近蓋的章", en: "Recent stamps" },
  "wall.stamped":      { zh: "<b>{who}</b> 蓋了 <b>{what}</b>", en: "<b>{who}</b> stamped <b>{what}</b>" },
  // 連不上
  "down.title":        { zh: "資料庫休眠中", en: "Database is asleep" },
  "down.lede":         { zh: "資料庫休眠中，你的資料都還在。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。", en: "The database is asleep. Your data is still there. Email beyondtaiwan2020@gmail.com to have it woken up." },
  // 領護照
  "setup.edit":        { zh: "編輯護照資料", en: "Edit passport details" },
  "setup.claim":       { zh: "領你的實習護照", en: "Get your intern passport" },
  "setup.editSub":     { zh: "改了哪一格就存哪一格，不用按儲存，章不會消失。", en: "Each field saves as you change it. No Save button, and your stamps stay." },
  "setup.done":        { zh: "回到護照", en: "Back to the passport" },
  "setup.claimSub":    { zh: "這一期的每一件事一格，做完就蓋章。", en: "One box for each thing this term. Finish it, stamp it." },
  "setup.nameZh":      { zh: "中文名 / Name", en: "Chinese name" },
  "setup.nameEn":      { zh: "英文名 / Name in English", en: "English name" },
  "setup.motto":       { zh: "護照上的一句話 / Your line（選填）", en: "Your line (optional)" },
  "setup.mottoPh":     { zh: "這一期想帶走什麼", en: "What you want to take away from this term" },
  "setup.note":        { zh: "送出後，你的姓名、大頭照與蓋章紀錄會出現在進度牆上，<b>Internship team 的幹部與同一期的 intern 看得到</b>。你寫的心得和上傳的照片只留在你自己的護照裡，<b>誰都看不到</b>。", en: "After you submit, your name, avatar and stamps appear on the progress wall, <b>visible to Internship team cadres and interns in your term</b>. The notes you write and the photos you upload stay in your own passport. <b>Nobody else can see them</b>." },
  "setup.claimBtn":    { zh: "領護照", en: "Get passport" },
  // main.js
  "m.toLogin":         { zh: "帶你去登入頁…", en: "Taking you to sign in…" },
  "m.pleaseLogin":     { zh: "請先登入。<a href=\"../app/\">去登入頁</a>", en: "Please sign in first. <a href=\"../app/\">Go to sign in</a>" },
  "m.internOnly":      { zh: "這裡只開放給 BT 的實習生。<a href=\"../app/\">回到入口</a>", en: "This is for BT interns only. <a href=\"../app/\">Back to the entrance</a>" },
  "m.notReadyTitle":   { zh: "護照還沒準備好", en: "The passport is not ready yet" },
  "m.notReady":        { zh: "你的帳號已經是實習生了，但護照那一頁的資料表還沒建好。請管理者跑完 2026-10-17 那支遷移檔，再重新整理。", en: "Your account is an intern account, but the passport table has not been created yet. Ask the administrator to run the 2026-10-17 migration, then refresh." },
  "m.slow":            { zh: "還在連資料庫…<br>如果一直停在這裡，可能是資料庫休眠了。", en: "Still connecting to the database…<br>If this does not move, the database may be asleep." },
  "m.reconnect":       { zh: "正在重新連線…", en: "Reconnecting…" },
  "md.date":           { zh: "日期 / Date", en: "Date" },
  "md.note":           { zh: "一句話 / One line（選填，最多 60 字）", en: "One line (optional, up to 60 characters)" },
  "md.notePh":         { zh: "做了什麼、學到什麼？", en: "What did you do, what did you learn?" },
  "md.photo":          { zh: "照片（選填，只存在你的護照裡）", en: "Photo (optional, kept only in your passport)" },
  "md.update":         { zh: "更新", en: "Update" },
  "md.stamp":          { zh: "蓋章", en: "Stamp" },
  "md.unstamp":        { zh: "撕掉這格", en: "Tear this off" },
  "m.imgFail":         { zh: "這張圖讀不到，換一張試試", en: "Could not read this image. Try another one" },
  "m.stamped":         { zh: "蓋好了。", en: "Stamped." },
  "m.updated":         { zh: "已更新。", en: "Updated." },
  "m.notSaved":        { zh: "沒有存起來，再試一次。", en: "Not saved. Try again." },
  "m.torn":            { zh: "撕掉了。", en: "Torn off." },
  "m.sampleOnly":      { zh: "這是樣書，看格子長什麼樣用的，蓋不了章。", en: "This is the sample, for seeing what the boxes look like. You cannot stamp it." },
  "confirm.unstamp":   { zh: "撕掉這格？日期、心得和照片都會不見。", en: "Tear this off? The date, note and photo will be gone." },
  "m.needName":        { zh: "至少填一個名字", en: "Fill in at least one name" },
  "m.claimed":         { zh: "護照領好了。", en: "Passport ready." },
  "err.notSignedIn":   { zh: "尚未登入", en: "Not signed in" },
  // 蛇梯棋（2026-10-22）。規則與做法見 docs/2026-10-19-實習護照蛇梯棋計畫.md。
  "page.board":        { zh: "棋盤", en: "Board" },
  "board.title":       { zh: "蛇梯棋", en: "Snakes & Ladders" },
  "board.sub":         { zh: "SNAKES & LADDERS", en: "ROLL TO MOVE" },
  "board.pos":         { zh: "你在第 {n} 格", en: "You are on square {n}" },
  "board.atStart":     { zh: "你在起點", en: "You are at the start" },
  "board.tickets":     { zh: "{n} 張票", en: "{n} {n:roll|rolls}" },
  "board.roll":        { zh: "擲骰子", en: "Roll the dice" },
  "board.rolling":     { zh: "擲骰中…", en: "Rolling…" },
  "board.noTicket":    { zh: "蓋一個章就有票", en: "Stamp a box to earn a roll" },
  "board.finished":    { zh: "到終點了", en: "Finished" },
  "board.waiting":     { zh: "差一格：蓋了「{t}」就到終點", en: "One square short: stamp \"{t}\" to finish" },
  "board.rolled":      { zh: "擲到 <b>{r}</b>，落在第 {l} 格", en: "Rolled a <b>{r}</b>, landed on square {l}" },
  "board.ladder":      { zh: "，爬梯子到第 {t} 格", en: ", climbed a ladder to square {t}" },
  "board.snake":       { zh: "，滑蛇到第 {t} 格", en: ", slid down a snake to square {t}" },
  "board.stop":        { zh: "，停在第 {t} 格", en: ", stopped on square {t}" },
  "board.suggest":     { zh: "推薦下一個做「{t}」，做完多送一張票。", en: "Next up: \"{t}\". Finish it for a bonus roll." },
  "board.goStamp":     { zh: "去蓋章", en: "Go stamp it" },
  "board.start":       { zh: "起點", en: "Start" },
  "board.finish":      { zh: "終點", en: "Finish" },
  "board.me":          { zh: "你", en: "You" },
  "board.rules":       { zh: "蓋一個章拿一張票，一張票擲一次。梯子往上、蛇往下。落在還沒做的任務格，做完多送一張票。票不會過期。", en: "One stamp earns one roll. Ladders go up, snakes go down. Land on an unstamped task square and finish it for a bonus roll. Rolls never expire." },
  "board.legendTask":  { zh: "任務格", en: "Task" },
  "board.legendLadder":{ zh: "梯子", en: "Ladder" },
  "board.legendSnake": { zh: "蛇", en: "Snake" },
  "board.sampleNote":  { zh: "樣書的棋盤：真的 intern 會看到自己的棋子在上面。", en: "Sample board: real interns see their own pawn on it." },
  "wall.board":        { zh: "大家在哪一格", en: "Where everyone is" },
  "wall.rank":         { zh: "第 {n} 格", en: "Square {n}" },
  "wall.rankDone":     { zh: "到終點", en: "Finished" },
  "m.rollFail":        { zh: "擲不了，再試一次。", en: "Could not roll. Try again." },
  "m.rollNoTicket":    { zh: "沒有票了。蓋一個章就有票。", en: "No rolls left. Stamp a box to earn one." },
  "m.rollFinished":    { zh: "你已經到終點了。", en: "You have already finished." },
  "m.rollNoBoard":     { zh: "這一屆的棋盤還沒開。", en: "This term's board is not on yet." },
  // 棋子（2026-10-23）
  "pawn.title":        { zh: "你的棋子", en: "Your pawn" },
  "pawn.hint":         { zh: "挑一個，棋盤上的你就長這樣。隨時可以換。", en: "Pick one. This is you on the board. You can change it any time." },
  "pawn.first":        { zh: "先挑一個棋子再上路", en: "Pick a pawn before you start" },
  "pawn.skip":         { zh: "先用大頭照", en: "Use my avatar for now" },
  "pawn.none":         { zh: "大頭照", en: "Avatar" },
  "pawn.meeple":       { zh: "小人", en: "Meeple" },
  "pawn.checker":      { zh: "棋子", en: "Checker" },
  "pawn.cat":          { zh: "貓", en: "Cat" },
  "pawn.bird":         { zh: "鳥", en: "Bird" },
  "pawn.fish":         { zh: "魚", en: "Fish" },
  "pawn.star":         { zh: "星星", en: "Star" },
  "pawn.boat":         { zh: "船", en: "Boat" },
  "pawn.kite":         { zh: "風箏", en: "Kite" },
  "m.pawnSaved":       { zh: "換好了。", en: "Pawn changed." },
  "wall.who":          { zh: "誰是哪一顆", en: "Who is which pawn" },
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
