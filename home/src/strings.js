// 幹部首頁與行事曆的字典（2026-10-28）。畫面上每一句中文與英文並排。
// 做法與理由見 docs/2026-10-19-後台中英切換.md，怎麼加一句見 README「登入後頁面的中英切換」。
//
// **每一個登入後的資料夾各有一支 strings.js**，不互相 import（跟 esc() 同一條規矩）。
// COMMON 那一段每一份一模一樣（test/lang.test.mjs 逐字比對），MINE 是這一頁自己的。
//
// 規矩：鍵是英文、用點分段；鍵以 err. 開頭的是「沒做成」的訊息；帶數字用 {n}。使用者填的字要先 esc() 再餵進 {}。

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
  "down.title":       { zh: "資料庫暫時連不上", en: "The database is not reachable" },
  "down.lede":        { zh: "可能是休眠中，等一分鐘再試一次。", en: "It may be asleep. Wait a minute and try again." },
  "nc.title":         { zh: "這一頁是給 BT 幹部的", en: "This page is for BT cadres" },
  "nc.lede":          { zh: "你已經登入了，但還不是幹部。", en: "You are signed in but not a cadre yet." },

  "home.hi":          { zh: "嗨，{name}", en: "Hi, {name}" },
  "home.today":       { zh: "今天是 {date}，時間照你的時區（{tz}）。", en: "Today is {date}. Times are in your time zone ({tz})." },
  "home.reply":       { zh: "等你回覆", en: "Waiting for your reply" },
  "home.replyLede":   { zh: "按一下讓排會的人知道你會不會到。", en: "One tap tells the organizer whether you're coming." },
  "home.next":        { zh: "接下來", en: "Coming up" },
  "home.nothing":     { zh: "接下來沒有排給你的會。", en: "Nothing scheduled for you yet." },
  "home.allClear":    { zh: "都回覆完了。", en: "All replied." },
  "home.do":          { zh: "我要…", en: "I want to…" },
  "home.doRequest":   { zh: "請 Marketing 做貼文或影片", en: "Ask Marketing for a post or video" },
  "home.doRequestSub":{ zh: "送一張需求單，進度在同一頁看。", en: "Send a request and follow it on the same page." },
  "home.doTime":      { zh: "填我有空的時間", en: "Fill in when I'm free" },
  "home.doTimeSub":   { zh: "排會的人照這個挑時間。", en: "Organizers pick times from this." },
  "home.doSchedule":  { zh: "排一場會", en: "Schedule a meeting" },
  "home.doScheduleSub":{ zh: "在時間看板挑一格，勾人，寄邀請。", en: "Pick a slot on the board, tick people, send invites." },
  "home.doPassport":  { zh: "打開我的護照", en: "Open my passport" },
  "home.doPassportSub":{ zh: "蓋章、寫心得。", en: "Stamps and notes." },
  "home.doCal":       { zh: "看整個月的行事曆", en: "See the whole month" },
  "home.doCalSub":    { zh: "會議與活動都在上面。", en: "Meetings and events in one place." },
  "home.linked":      { zh: "你從信裡點進來的那一場：", en: "The meeting from your email:" },
  "home.gone":        { zh: "找不到這場會，可能已經刪了。", en: "Meeting not found; it may have been deleted." },
  "home.past":        { zh: "這場會已經結束了。", en: "This meeting is over." },

  "tag.required":     { zh: "必到", en: "Required" },
  "tag.optional":     { zh: "選擇參加", en: "Optional" },
  "tag.event":        { zh: "活動", en: "Event" },
  "tag.organizer":    { zh: "你排的", en: "You organized" },
  "scope.board":      { zh: "全體 BT", en: "Whole BT" },

  "me.ask":           { zh: "你會到嗎？", en: "Can you make it?" },
  "me.yes":           { zh: "我會到", en: "I'll be there" },
  "me.no":            { zh: "不能到", en: "Can't make it" },
  "me.saidYes":       { zh: "你會到", en: "You're coming" },
  "me.saidNo":        { zh: "你不能到", en: "You can't make it" },
  "me.waiting":       { zh: "還沒回", en: "Not replied" },
  "me.change":        { zh: "改", en: "Change" },
  "me.notInvited":    { zh: "這場的名單上沒有你，只能看。", en: "You're not on the list for this one; view only." },
  "me.reason":        { zh: "必到的會不能到，寫一句理由給排會的人", en: "This one is required. Tell the organizer why you can't make it" },
  "me.reasonPh":      { zh: "例如：那天要考試", en: "e.g. I have an exam that day" },
  "me.reasonNote":    { zh: "只有你、排這場會的人、能排這個範圍的人看得到。", en: "Only you, the organizer and people who can schedule this scope see it." },
  "me.send":          { zh: "送出", en: "Send" },
  "me.yourReason":    { zh: "你寫的理由：{note}", en: "Your reason: {note}" },
  "msg.yes":          { zh: "記下來了：你會到。排會的人看得到。", en: "Noted: you're coming. The organizer can see it." },
  "msg.no":           { zh: "記下來了：你不能到。排會的人看得到。", en: "Noted: you can't make it. The organizer can see it." },

  "org.title":        { zh: "誰會到", en: "Who's coming" },
  "org.counts":       { zh: "{yes} 會到・{no} 不能到・{wait} 還沒回", en: "{yes} coming · {no} can't · {wait} no reply" },
  "org.yes":          { zh: "會到", en: "Coming" },
  "org.no":           { zh: "不能到", en: "Can't make it" },
  "org.wait":         { zh: "還沒回", en: "No reply yet" },
  "org.none":         { zh: "沒有", en: "None" },
  "org.mailNote":     { zh: "開會前 24 小時會寄一封總表給排會的人。", en: "The organizer gets a summary email 24 hours before." },

  "m.when":           { zh: "時間", en: "When" },
  "m.agenda":         { zh: "議程", en: "Agenda" },
  "m.notes":          { zh: "會議紀錄", en: "Notes" },
  "m.openNotes":      { zh: "打開會議紀錄", en: "Open the notes" },
  "m.noNotes":        { zh: "還沒有會議紀錄的連結。", en: "No notes link yet." },
  "m.gcal":           { zh: "加到 Google 日曆", en: "Add to Google Calendar" },
  "m.ics":            { zh: "下載 .ics", en: "Download .ics" },
  "m.place":          { zh: "地點", en: "Where" },
  "m.openEvent":      { zh: "看活動頁", en: "Open the event page" },
  "m.close":          { zh: "關掉", en: "Close" },
  "m.edit":           { zh: "在後台改這場會", en: "Edit in Admin" },

  "cal.month":        { zh: "月", en: "Month" },
  "cal.week":         { zh: "週", en: "Week" },
  "cal.prev":         { zh: "上一個", en: "Previous" },
  "cal.next":         { zh: "下一個", en: "Next" },
  "cal.today":        { zh: "今天", en: "Today" },
  "cal.mine":         { zh: "只看我的", en: "Just mine" },
  "cal.all":          { zh: "整個 BT", en: "All of BT" },
  "cal.more":         { zh: "還有 {n} 個", en: "{n} more" },
  "cal.legend":       { zh: "實心是必到，框線是選擇參加，橘色是活動。", en: "Solid is required, outlined is optional, orange is an event." },
  "cal.empty":        { zh: "這段時間沒有東西。", en: "Nothing in this range." },
  "cal.title":        { zh: "行事曆", en: "Calendar" },

  "err.load":         { zh: "沒載進來：", en: "Could not load: " },
  "err.rsvp":         { zh: "沒記下來：", en: "Not saved: " },
  "err.needReason":   { zh: "必到的會不能到，要寫一句理由。", en: "This meeting is required; please write a reason." },
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
