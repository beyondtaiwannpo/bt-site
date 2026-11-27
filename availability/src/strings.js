// 時間看板 的字典：畫面上每一句中文與英文並排（2026-10-19，登入後頁面的中英切換）。
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
  // 星期。DAY_ZH（日一二三四五六）留在 ui.js 當儲存與排序用的常數，畫面用這裡。
  "day.0":            { zh: "日", en: "Sun" },
  "day.1":            { zh: "一", en: "Mon" },
  "day.2":            { zh: "二", en: "Tue" },
  "day.3":            { zh: "三", en: "Wed" },
  "day.4":            { zh: "四", en: "Thu" },
  "day.5":            { zh: "五", en: "Fri" },
  "day.6":            { zh: "六", en: "Sat" },
  "dayFull.0":        { zh: "星期日", en: "Sunday" },
  "dayFull.1":        { zh: "星期一", en: "Monday" },
  "dayFull.2":        { zh: "星期二", en: "Tuesday" },
  "dayFull.3":        { zh: "星期三", en: "Wednesday" },
  "dayFull.4":        { zh: "星期四", en: "Thursday" },
  "dayFull.5":        { zh: "星期五", en: "Friday" },
  "dayFull.6":        { zh: "星期六", en: "Saturday" },
  // 分頁與翻週
  "tab.toCal":        { zh: "看大家有空的時間、排會", en: "See who is free and schedule" },
  "tab.toCalNote":    { zh: "以前的「團隊看板」搬到行事曆：切到「日」看每半小時有幾個人有空；能排會的人點一個日期就排，每個人後面標著有沒有空。這一頁填你自己的時間。", en: "The old Team board moved to the Calendar: switch to Day to see how many people are free each half hour. If you can schedule, click a date to set up a meeting, and each person shows whether they are free. Fill in your own times here." },
  "tab.mine":         { zh: "我的時間", en: "My time" },
  "tab.who":          { zh: "成員", en: "Members" },
  "week.prev":        { zh: "← 前一週", en: "← Previous week" },
  "week.next":        { zh: "後一週 →", en: "Next week →" },
  "week.this":        { zh: "回本週", en: "This week" },
  // 知情同意
  "n.title":          { zh: "填之前先知道一件事", en: "One thing before you fill it in" },
  "n.sub":            { zh: "這一頁只出現一次。", en: "This page appears only once." },
  "n.body":           { zh: "你填的每週時間，<b>其他 BT 幹部看得到</b>。<br>\n      他們看得到你哪一天固定有空、哪一天固定不在。", en: "The weekly times you fill in are <b>visible to other BT cadres</b>.<br>They can see which days you are usually free and which you are usually away." },
  "n.p1":             { zh: "看板要回答的就是「這個時段有誰有空」，所以每個幹部都會看到全部人的時間，\n      不是只看到人數。這是這個功能的形狀，沒有辦法只給你看得到的部分。", en: "The board exists to answer \"who is free at this time\", so every cadre sees everyone's times, not just a count. That is the shape of this feature. There is no version that shows only your part." },
  "n.p2":             { zh: "你的護照心得與活動照片<b>不在這裡面</b>，那些仍然只有你自己看得到。", en: "Your passport notes and photos are <b>not part of this</b>. Those stay visible only to you." },
  "n.busy":           { zh: "處理中…", en: "Working…" },
  "n.ok":             { zh: "我知道了，開始填", en: "Got it, start filling in" },
  "n.no":             { zh: "先不要", en: "Not now" },
  // 時區
  "tz.title":         { zh: "你在哪裡？", en: "Where are you?" },
  "tz.sub":           { zh: "用來把你的時間換算給其他人看。之後在設定頁可以改。", en: "Used to convert your times for everyone else. You can change it later in Settings." },
  "tz.guess":         { zh: "看起來你在 <b>{place}</b>。", en: "It looks like you are in <b>{place}</b>." },
  "tz.here":          { zh: "就是這裡", en: "That is right" },
  "tz.search":        { zh: "搜尋城市（中英文都可以）", en: "Search for a city (Chinese or English)" },
  "tz.searchPh":      { zh: "密西根、Ann Arbor、台北…", en: "Michigan, Ann Arbor, Taipei…" },
  "tz.none":          { zh: "找不到「{q}」。換個講法試試，例如打州名或最近的大城市。", en: "Nothing found for \"{q}\". Try another wording, such as the state or the nearest big city." },
  // 團隊看板
  "tf.all":           { zh: "全部", en: "All" },
  // 彈窗
  // 我的每週時間
  "mn.slot":          { zh: "時段", en: "Time" },
  "mn.to":            { zh: "到", en: "to" },
  "mn.days":          { zh: "星期", en: "Days" },
  "mn.quick":         { zh: "快捷", en: "Quick picks" },
  "mn.weekday":       { zh: "平日", en: "Weekdays" },
  "mn.weekend":       { zh: "週末", en: "Weekend" },
  "mn.all":           { zh: "全部", en: "All" },
  "mn.clear":         { zh: "清除勾選", en: "Clear" },
  "mn.add":           { zh: "加入這段", en: "Add this range" },
  "mn.del":           { zh: "拿掉這段", en: "Remove this range" },
  "mn.copy":          { zh: "複製", en: "Copy" },
  "mn.copyTo":        { zh: "複製到勾選的那幾天", en: "to the ticked days" },
  "mn.cellAria":      { zh: "星期{d} {t}", en: "{d} {t}" },
  "mn.titleWeek":     { zh: "這一週的時間", en: "This week's time" },
  "mn.titleUsual":    { zh: "我的每週時間", en: "My weekly time" },
  "mn.subWeek":       { zh: "{w} 這一週會用這裡的設定，<b>不會影響你平常的時間</b>。", en: "The week of {w} uses what you set here. <b>Your usual times are not affected</b>." },
  "mn.subUsual":      { zh: "填「每週固定有空」的時段，不是特定日期。改一次可以用一整個學期。", en: "Fill in when you are usually free each week, not specific dates. Set it once and it lasts a semester." },
  "mn.modeUsual":     { zh: "平常的時間", en: "Usual times" },
  "mn.modeWeek":      { zh: "某一週", en: "A specific week" },
  "mn.prevWeek":      { zh: "上一週", en: "Previous week" },
  "mn.nextWeek":      { zh: "下一週", en: "Next week" },
  "mn.past":          { zh: "過去的週不能改。<br>\n      改已經過去的時間沒有意義，而且會讓人以為自己在改未來。\n      要改就往後翻到本週或以後。", en: "Past weeks cannot be changed.<br>Editing time that has passed means nothing and makes it look like you are changing the future. Go forward to this week or later." },
  "mn.marked":        { zh: "你已經為這幾週特別設定過：", en: "You have set these weeks separately:" },
  "mn.gone":          { zh: "（已經過去）", en: "(already past)" },
  "mn.revert":        { zh: "回到平常的時間", en: "Back to usual times" },
  "mn.confirmSame":   { zh: "我確認過了，沒有變", en: "I checked, nothing changed" },
  "mn.tz":            { zh: "時區：<b>{tz}</b>", en: "Time zone: <b>{tz}</b>" },
  "mn.changeIn":      { zh: "到設定頁改", en: "Change in Settings" },
  "mn.tzNote":        { zh: "填的是這個時區的當地時間。搬家的話到設定頁改，改完你所有的時段都會照新的時區重新解讀。", en: "Times are local to this time zone. If you move, change it in Settings. All your slots are then read in the new zone." },
  // 成員
  "mb.title":         { zh: "成員", en: "Members" },
  "mb.sub":           { zh: "超過 30 天沒更新的標紅。看板要問的是「這份資料還可信嗎」，\n      所以沒有變的人也可以按「我確認過了」把時間往前推。", en: "Anyone who has not updated in 30 days is marked red. The board's question is \"can this still be trusted\", so even if nothing changed you can press \"I checked\" to bump the date." },
  "mb.name":          { zh: "名字", en: "Name" },
  "mb.where":         { zh: "所在地", en: "Location" },
  "mb.updated":       { zh: "上次更新", en: "Last updated" },
  "mb.noTz":          { zh: "還沒設定時區", en: "No time zone yet" },
  "mb.never":         { zh: "還沒填過", en: "Never filled in" },
  "mb.daysAgo":       { zh: "{d} 天前", en: "{d} {d:day|days} ago" },
  "mb.stale":         { zh: "　該更新了", en: ", time to update" },
  "mb.zero":          { zh: "（目前 0 格）", en: " (0 slots now)" },
  "mb.note":          { zh: "「還沒設定時區」的人，他們填的時間畫不出來，\n      所以不會出現在團隊看板上 —— 那不是他們沒空，是我們不知道該把他們畫在哪裡。", en: "People with no time zone cannot be drawn, so they do not appear on the team board. It is not that they are busy. We just do not know where to draw them." },
  // 連不上、不是幹部
  "down.title":       { zh: "連不上資料庫", en: "Cannot reach the database" },
  "down.lede":        { zh: "現在讀不到看板。你已經填過的時間都還在。\n      請寄信到 beyondtaiwan2020@gmail.com 請人看一下。", en: "The board cannot be read right now. The times you filled in are still there. Email beyondtaiwan2020@gmail.com to have someone look." },
  "nc.title":         { zh: "這裡只開放給 BT 幹部", en: "For BT cadres only" },
  "nc.lede":          { zh: "時間看板存的是幹部的每週作息，只有幹部看得到。", en: "The board holds cadres' weekly schedules, so only cadres can see it." },
  // main.js
  "m.onlyBack":       { zh: "只能往前看四週。", en: "You can only look back four weeks." },
  "m.saving":         { zh: "存起來中…", en: "Saving…" },
  "m.reverted":       { zh: "那一週回到你平常的時間了。", en: "That week is back to your usual times." },
  "m.revertFail":     { zh: "取消不了：", en: "Could not undo: " },
  "m.pickDays":       { zh: "先選要套用到哪幾天。", en: "Pick the days to apply to first." },
  "m.endAfter":       { zh: "結束時間要比開始時間晚。", en: "The end time has to be after the start." },
  // 2026-11-06 自動儲存：沒有儲存鈕了，這三句不再說「記得按儲存」。
  "m.added":          { zh: "加了 {n} 格。", en: "Added {n} {n:slot|slots}." },
  "m.removed":        { zh: "拿掉了 {n} 格。", en: "Removed {n} {n:slot|slots}." },
  "m.pickCopy":       { zh: "先選要複製到哪幾天。", en: "Pick the days to copy to first." },
  "m.copied":         { zh: "複製好了，變動 {n} 格。", en: "Copied. {n} {n:slot|slots} changed." },
  "m.savedDiff":      { zh: "存好了（+{a} / -{d}）。", en: "Saved (+{a} / -{d})." },
  "m.noChange":       { zh: "沒有變動。", en: "Nothing changed." },
  "m.recording":      { zh: "記錄中…", en: "Recording…" },
  "m.confirmed":      { zh: "記下來了，這份時間是最新的。", en: "Noted. These times are current." },
  // 排一場會與回覆（2026-11-02）
  "rsvp.doc":         { zh: "會議紀錄", en: "Meeting notes" },
  "rsvp.yes":         { zh: "會到", en: "I'll be there" },
  "rsvp.no":          { zh: "不能到", en: "Can't make it" },
  "rsvp.ics":         { zh: "下載 .ics", en: "Download .ics" },
  "rsvp.gone":        { zh: "找不到這場會，可能已經取消了。", en: "Meeting not found; it may have been cancelled." },
  "rsvp.saidYes":     { zh: "記下來了：會到。", en: "Noted: you'll be there." },
  "rsvp.saidNo":      { zh: "記下來了：不能到。", en: "Noted: you can't make it." },
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
