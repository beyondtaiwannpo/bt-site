// 幹部護照 的字典：畫面上每一句中文與英文並排（2026-10-19，登入後頁面的中英切換）。
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
  // 三個分類的名字。define 與 body 本來就是英文（2026-08-23 Paul 親手寫的），留在 ui.js 的 CATEGORY 裡。
  "cat.gather":       { zh: "聚會 GATHER", en: "GATHER" },
  "cat.gather.short": { zh: "聚會", en: "Gather" },
  "cat.prompt":       { zh: "題目 PROMPT", en: "PROMPT" },
  "cat.prompt.short": { zh: "題目", en: "Prompt" },
  "cat.frame":        { zh: "鏡頭 FRAME", en: "FRAME" },
  "cat.frame.short":  { zh: "鏡頭", en: "Frame" },
  // 月名是語言常數，不是活動內容（spec §5 只禁止活動內容寫死）。
  "month.1":          { zh: "一月", en: "January" },
  "month.2":          { zh: "二月", en: "February" },
  "month.3":          { zh: "三月", en: "March" },
  "month.4":          { zh: "四月", en: "April" },
  "month.5":          { zh: "五月", en: "May" },
  "month.6":          { zh: "六月", en: "June" },
  "month.7":          { zh: "七月", en: "July" },
  "month.8":          { zh: "八月", en: "August" },
  "month.9":          { zh: "九月", en: "September" },
  "month.10":         { zh: "十月", en: "October" },
  "month.11":         { zh: "十一月", en: "November" },
  "month.12":         { zh: "十二月", en: "December" },
  // 子欄、翻頁
  "bar.mine":         { zh: "我的護照", en: "My passport" },
  "bar.wall":         { zh: "進度牆", en: "Progress wall" },
  "bar.stamps":       { zh: "Stamps collected", en: "Stamps collected" },
  "page.id":          { zh: "資料頁", en: "Details" },
  "page.guide":       { zh: "怎麼用", en: "How to use" },
  "nav.prev":         { zh: "← 前一頁", en: "← Previous" },
  "nav.next":         { zh: "下一頁 →", en: "Next →" },
  // 資料頁。欄位標籤原本就是「英文 / 中文」並排，英文版只剩英文那一半。
  "id.title":         { zh: "持照人資料", en: "Holder details" },
  "id.upload":        { zh: "點此上傳<br>大頭照", en: "Tap to upload<br>an avatar" },
  "id.changeAvatar":  { zh: "到設定換大頭照", en: "Change the avatar in Settings" },
  "id.type":          { zh: "Type / 類別", en: "Type" },
  "id.code":          { zh: "Code / 代碼", en: "Code" },
  "id.no":            { zh: "Passport No. / 護照號碼", en: "Passport No." },
  "id.issue":         { zh: "Date of issue / 核發日", en: "Date of issue" },
  "id.name":          { zh: "Name / 姓名", en: "Name" },
  "id.team":          { zh: "Team / 所屬團隊", en: "Team" },
  "id.edit":          { zh: "編輯資料", en: "Edit details" },
  "id.export":        { zh: "匯出備份", en: "Export backup" },
  "id.import":        { zh: "匯入還原", en: "Import backup" },
  "id.reset":         { zh: "清除這本護照", en: "Clear this passport" },
  // 格子
  "slot.cta":         { zh: "蓋章 →", en: "Stamp →" },
  "flip.back":        { zh: "翻到背面", en: "Flip to the back" },
  "flip.front":       { zh: "翻到正面", en: "Flip to the front" },
  // 回望（spec §7.3，兩句文案逐字抄自 spec）
  "cb.noneWhen":      { zh: "你{when}沒有寫這格", en: "You did not write this box in {when}" },
  "cb.none":          { zh: "你之前沒有寫這格", en: "You did not write this box before" },
  "cb.noneTail":      { zh: "。沒關係，這格照樣可以寫。", en: ". That is fine. You can still write it now." },
  "cb.wroteWhen":     { zh: "你在{when}寫的", en: "What you wrote in {when}" },
  "cb.wrote":         { zh: "你之前寫的", en: "What you wrote before" },
  // 說明頁、引導頁
  "guide.title":      { zh: "怎麼用這本護照", en: "How to use this passport" },
  "intro.sub":        { zh: "一年 33 格，每個月三格。這一頁之後在護照裡隨時翻得到。", en: "33 boxes a year, three a month. You can find this page in the passport any time." },
  "intro.start":      { zh: "開始蓋章", en: "Start stamping" },
  // 進度牆
  "wall.loading":     { zh: "正在讀取全體進度…", en: "Loading everyone's progress…" },
  "wall.title":       { zh: "全體進度牆", en: "Progress wall" },
  "wall.error":       { zh: "進度牆讀不到。按下面的重新整理再試一次，你自己的護照不受影響。", en: "Could not load the wall. Press refresh below to try again. Your own passport is not affected." },
  "wall.refresh":     { zh: "重新整理", en: "Refresh" },
  "wall.note":        { zh: "這面牆是公開的：所有 BT 幹部都看得到你的名字、團隊、大頭照與蓋章紀錄。你寫的心得和上傳的活動照片不會出現在這裡，其他幹部看不到。", en: "This wall is shared: every BT cadre can see your name, team, avatar and stamps. Your notes and photos do not appear here. Other cadres cannot see them." },
  "wall.empty":       { zh: "還沒有人蓋章。去蓋第一個吧。", en: "Nobody has stamped yet. Go get the first one." },
  "wall.recent":      { zh: "最近蓋的章", en: "Recent stamps" },
  "wall.stamped":     { zh: "<b>{who}</b> 蓋了 <b>{what}</b>", en: "<b>{who}</b> stamped <b>{what}</b>" },
  // 連不上
  "down.title":       { zh: "資料庫休眠中", en: "Database is asleep" },
  "down.lede":        { zh: "資料庫休眠中，你的資料都還在。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。", en: "The database is asleep. Your data is still there. Email beyondtaiwan2020@gmail.com to have it woken up." },
  // 申請／編輯護照資料
  "setup.edit":       { zh: "編輯護照資料", en: "Edit passport details" },
  "setup.apply":      { zh: "申請你的 BT 護照", en: "Get your BT passport" },
  "setup.editSub":    { zh: "改完按儲存，章不會消失。", en: "Press Save when you are done. Your stamps stay." },
  "setup.applySub":   { zh: "一年 33 格，每個月三個。蓋滿的人，年底會有一整本回憶。", en: "33 boxes a year, three a month. Fill them all and you have a whole book of memories by the end of the year." },
  "setup.nameZh":     { zh: "中文名 / Name", en: "Chinese name" },
  "setup.nameEn":     { zh: "英文名 / Name in English（會印在機讀碼上）", en: "English name (printed in the machine-readable zone)" },
  "setup.team":       { zh: "所屬團隊 / Team", en: "Team" },
  "setup.teamNote":   { zh: "要選好幾個 team 的話到<a href=\"../settings/\">設定</a>。", en: "To pick several teams go to <a href=\"../settings/\">Settings</a>." },
  "setup.motto":      { zh: "護照上的一句話 / Your line（選填）", en: "Your line (optional)" },
  "setup.mottoPh":    { zh: "你無法選擇你從未看見的東西。", en: "You cannot choose what you have never seen." },
  "setup.note":       { zh: "送出後，你的姓名、團隊、大頭照與蓋章紀錄會出現在全體進度牆上，<b>其他 BT 幹部看得到，包含你的大頭照</b>。你寫的心得和上傳的活動照片只留在你自己的護照裡，<b>其他幹部看不到</b>。", en: "After you submit, your name, team, avatar and stamps appear on the progress wall, <b>visible to other BT cadres, including your avatar</b>. The notes you write and the photos you upload stay in your own passport. <b>Other cadres cannot see them</b>." },
  "setup.issue":      { zh: "核發護照", en: "Issue passport" },
  // main.js
  "m.toLogin":        { zh: "帶你去登入頁…", en: "Taking you to sign in…" },
  "m.pleaseLogin":    { zh: "請先登入。<a href=\"../app/\">去登入頁</a>", en: "Please sign in first. <a href=\"../app/\">Go to sign in</a>" },
  "m.cadreOnly":      { zh: "這裡只開放給 BT 幹部。<a href=\"../app/\">回到入口</a>", en: "This is for BT cadres only. <a href=\"../app/\">Back to the entrance</a>" },
  "m.slow":           { zh: "還在連資料庫…<br>如果一直停在這裡，可能是資料庫休眠了。", en: "Still connecting to the database…<br>If this does not move, the database may be asleep." },
  "m.reconnect":      { zh: "正在重新連線…", en: "Reconnecting…" },
  "md.date":          { zh: "日期 / Date", en: "Date" },
  "md.note":          { zh: "一句話 / One line（選填，最多 60 字）", en: "One line (optional, up to 60 characters)" },
  "md.notePh":        { zh: "那天發生了什麼？", en: "What happened that day?" },
  "md.photo":         { zh: "照片（選填，只存在你的護照裡）", en: "Photo (optional, kept only in your passport)" },
  "md.update":        { zh: "更新", en: "Update" },
  "md.stamp":         { zh: "蓋章", en: "Stamp" },
  "md.unstamp":       { zh: "撕掉這格", en: "Tear this off" },
  "m.imgFail":        { zh: "這張圖讀不到，換一張試試", en: "Could not read this image. Try another one" },
  "m.stamped":        { zh: "蓋好了。", en: "Stamped." },
  "m.updated":        { zh: "已更新。", en: "Updated." },
  "m.notSaved":       { zh: "沒有存起來，再試一次。", en: "Not saved. Try again." },
  "m.noProfileRow":   { zh: "沒有存起來：資料庫裡找不到你這個人的那一列。把這句話截圖給 Paul。", en: "Not saved: your profile row is missing in the database. Send Paul a screenshot of this." },
  "m.noPassportRow":  { zh: "沒有存起來：你的護照那一列補不出來。把這句話截圖給 Paul。", en: "Not saved: your passport row could not be created. Send Paul a screenshot of this." },
  "m.torn":           { zh: "撕掉了。", en: "Torn off." },
  "confirm.unstamp":  { zh: "撕掉這格？日期、心得和照片都會不見。", en: "Tear this off? The date, note and photo will be gone." },
  "m.needName":       { zh: "至少填一個名字", en: "Fill in at least one name" },
  "m.issued":         { zh: "護照核發完成。", en: "Passport issued." },
  "m.exported":       { zh: "備份下載好了。收在你自己的雲端硬碟裡。", en: "Backup downloaded. Keep it in your own cloud drive." },
  "m.summary":        { zh: "這個備份檔有 {n} 個章，匯出日期 {d}", en: "This backup has {n} {n:stamp|stamps}, exported {d}" },
  "m.unknownDate":    { zh: "不明", en: "unknown" },
  "m.belonged":       { zh: "，原本屬於護照 {no}。", en: ", originally from passport {no}." },
  "m.period":         { zh: "。", en: "." },
  "m.profileNote":    { zh: "還原也會把你的姓名、團隊、標語和大頭照換成備份檔裡的。", en: "Restoring also replaces your name, team, motto and avatar with the ones in the backup." },
  "confirm.importHas":{ zh: "{summary}\n\n你現在的護照已經有 {has} 個章。\n\n按「確定」＝ 覆蓋：現在這 {has} 個章、心得和照片會全部刪掉，換成備份檔裡的。\n按「取消」＝ 合併：兩邊的章都留，同一格以備份檔的內容為準。\n\n{note}（兩種選擇都一樣）", en: "{summary}\n\nYour passport already has {has} {has:stamp|stamps}.\n\nOK = overwrite: these {has} stamps, notes and photos are deleted and replaced with the backup.\nCancel = merge: keep both. Where a box is in both, the backup wins.\n\n{note} (either way)" },
  "confirm.importEmpty": { zh: "{summary}\n\n{note}\n\n要還原到你現在的帳號嗎？", en: "{summary}\n\n{note}\n\nRestore into your current account?" },
  "m.restored":       { zh: "還原了 {n} 個章。", en: "Restored {n} {n:stamp|stamps}." },
  "m.restoreFail":    { zh: "還原失敗，資料沒有被改動。再試一次。", en: "Restore failed. Nothing was changed. Try again." },
  "confirm.reset":    { zh: "清除這本護照？所有的章、心得和照片都會消失，無法復原。", en: "Clear this passport? Every stamp, note and photo will be gone. This cannot be undone." },
  "m.resetFail":      { zh: "沒有清除成功，再試一次。", en: "Could not clear. Try again." },
  // data.js
  "err.notSignedIn":  { zh: "尚未登入", en: "Not signed in" },
  "err.noExport":     { zh: "還沒有護照可以匯出。", en: "There is no passport to export yet." },
  "err.badFile":      { zh: "這個檔案讀不出來，可能不是護照備份檔，或是在傳送過程中壞掉了。", en: "Could not read this file. It may not be a passport backup, or it was damaged in transfer." },
  "err.notBackup":    { zh: "這是一個 JSON 檔，但不是護照備份檔。請選你從護照按「匯出備份」下載的那個檔案。", en: "This is a JSON file but not a passport backup. Choose the file you downloaded with \"Export backup\"." },
  "err.tooNew":       { zh: "這個備份檔來自比較新的版本，這個網站讀不了。請寄信到 beyondtaiwan2020@gmail.com。", en: "This backup comes from a newer version and this site cannot read it. Email beyondtaiwan2020@gmail.com." },
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
