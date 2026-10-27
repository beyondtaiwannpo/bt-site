// 設定頁 的字典：畫面上每一句中文與英文並排（2026-10-19，登入後頁面的中英切換）。
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
  // 年級。值存在資料庫裡是中文（高一、高二…），畫面上英文只是顯示，存的還是中文。
  "grade.高一":       { zh: "高一", en: "Grade 10" },
  "grade.高二":       { zh: "高二", en: "Grade 11" },
  "grade.高三":       { zh: "高三", en: "Grade 12" },
  "grade.已畢業":     { zh: "已畢業", en: "Graduated" },
  "grade.其他":       { zh: "其他", en: "Other" },
  // 所屬 team
  "team.legend":      { zh: "所屬 team", en: "Team" },
  "team.none":        { zh: "（還沒有）", en: "(none yet)" },
  "team.labelNote":   { zh: "只是標籤：時間看板篩選、團隊頁分組用，不決定你在後台管得到什麼。後台的權限由 Co-President 在工作區那一頁派。", en: "A label only: for the availability filter and team page grouping. It does not decide what you can reach in the admin; Co-Presidents assign that under Workspaces." },
  "team.legendMulti": { zh: "所屬 team（可以選好幾個）", en: "Teams (pick as many as apply)" },
  "team.original":    { zh: "（原本填的）", en: " (as previously entered)" },
  // 我的故事還缺什麼、狀態一句話
  "story.school":     { zh: "高中", en: "high school" },
  "story.county":     { zh: "縣市", en: "county" },
  "story.city":       { zh: "現在的城市", en: "current city" },
  "story.country":    { zh: "國家", en: "country" },
  "story.place":      { zh: "學校或公司", en: "school or company" },
  "story.quote":      { zh: "一句話", en: "the line" },
  "story.note":       { zh: "介紹", en: "the intro" },
  "story.st.private": { zh: "還沒有勾同意，所以這一段只有你自己看得到。", en: "You have not given consent, so only you can see this part." },
  "story.st.pending": { zh: "已經送出，等 Co-President 核可才會出現在公開的校友頁上。", en: "Submitted. It appears on the public alumni page once a Co-President approves it." },
  "story.st.live":    { zh: "已經在公開的校友頁上了。改了那一句話或介紹，會自動下架等重新核可。", en: "It is on the public alumni page. If you edit the line or the intro it is taken down until approved again." },
  // 設定頁
  "s.title":          { zh: "設定", en: "Settings" },
  "s.me":             { zh: "我的資料", en: "My details" },
  "s.nameZh":         { zh: "中文姓名", en: "Chinese name" },
  "s.nameEn":         { zh: "英文姓名", en: "English name" },
  "s.name":           { zh: "你的名字", en: "Your name" },
  "s.school":         { zh: "就讀學校", en: "School" },
  "s.schoolPh":       { zh: "打兩個字就會跳出來", en: "Type two characters to see suggestions" },
  "s.grade":          { zh: "年級", en: "Grade" },
  "s.pick":           { zh: "請選擇", en: "Choose" },
  "s.newsletter":     { zh: "我願意收 BT 的活動通知與資源更新。每一封都有取消訂閱的連結。", en: "I would like BT's event notices and resource updates. Every email has an unsubscribe link." },
  "s.save":           { zh: "存起來", en: "Save" },
  "s.saveNote":       { zh: "這一頁上面的變更會一起存起來。", en: "Everything above on this page is saved together." },
  "s.passport":       { zh: "護照", en: "Passport" },
  "s.passportNote":   { zh: "個人標語、蓋章紀錄、心得與照片都在護照裡面。", en: "Your motto, stamps, notes and photos are in the passport." },
  "s.goPassport":     { zh: "去護照", en: "Go to passport" },
  "s.internWall":     { zh: "實習生進度牆", en: "Intern progress wall" },
  "s.internPassport": { zh: "實習護照", en: "Intern passport" },
  "s.internNote":     { zh: "這一期的任務、章、心得與照片都在實習護照裡面。", en: "This term's tasks, stamps, notes and photos are in the intern passport." },
  "s.goIntern":       { zh: "去實習護照", en: "Go to intern passport" },
  "s.leave":          { zh: "要離開 BT 的話，帳號的處理是換屆交接的一部分，\n             寄信到 <a href=\"mailto:beyondtaiwan2020@gmail.com\">beyondtaiwan2020@gmail.com</a>。", en: "If you are leaving BT, your account is handled as part of the handover. Email <a href=\"mailto:beyondtaiwan2020@gmail.com\">beyondtaiwan2020@gmail.com</a>." },
  "s.delete":         { zh: "刪除我的帳號與所有資料", en: "Delete my account and all my data" },
  // 大頭照
  "av.title":         { zh: "大頭照", en: "Avatar" },
  "av.change":        { zh: "換一張大頭照", en: "Change avatar" },
  "av.upload":        { zh: "點這裡<br>上傳", en: "Tap to<br>upload" },
  "av.intern":        { zh: "這張照片會出現在<b>實習生進度牆</b>上，Internship team 的幹部與同一期的 intern 看得到。<br>\n        不會出現在任何對外的頁面上。不上傳也沒有關係。", en: "This photo appears on the <b>intern progress wall</b>, visible to Internship team cadres and interns in the same term.<br>It never appears on a public page. You do not have to upload one." },
  "av.alumni":        { zh: "這張照片會跟著你下面那段故事一起出現在<b>任何人都看得到的\n        <a href=\"../alumni/\">公開校友頁</a></b>上，<b>故事被核可之後</b>才會出現。<br>\n        不上傳也沒有關係，那一頁會改用你名字的第一個字。", en: "This photo appears with your story below on the <b><a href=\"../alumni/\">public alumni page</a>, which anyone can see</b>, <b>once the story is approved</b>.<br>You do not have to upload one. The page uses the first letter of your name instead." },
  "av.titleCadre":    { zh: "大頭照與公開", en: "Avatar and public page" },
  "av.cadre":         { zh: "這張照片會出現在<b>全體幹部看得到的進度牆</b>上。<br>\n        下面那個勾打起來之後，它還會出現在<b>任何人都看得到的公開團隊頁</b>上。", en: "This photo appears on the <b>progress wall all cadres can see</b>.<br>If you tick the box below it also appears on the <b>public team page, which anyone can see</b>." },
  "av.consent":       { zh: "我同意把我的名字、team 與大頭照放上\n        <a href=\"../team/\">公開的團隊頁</a>。那一頁任何人都看得到，也會被搜尋引擎收錄。\n        不打勾完全沒有關係，也不影響你在 BT 做的任何事。", en: "I agree to put my name, team and avatar on the <a href=\"../team/\">public team page</a>. Anyone can see that page and search engines index it. Not ticking is completely fine and does not affect anything you do in BT." },
  "av.titleIs":       { zh: "團隊頁上會印：{title}。要改請找 Co-President。", en: "The team page will show: {title}. Ask a Co-President to change it." },
  "av.noTitle":       { zh: "這一屆還沒有你的職位，團隊頁上不會出現。請 Co-President 到後台的幹部名單填。", en: "You have no position this term yet, so you will not appear on the team page. Ask a Co-President to set it under Roster in the admin." },
  "av.approved":      { zh: "已經在公開的團隊頁上了。隨時可以把上面那個勾拿掉。", en: "You are on the public team page. You can untick the box above at any time." },
  "av.pending":       { zh: "還要等 Co-President 核可才會真的出現在公開頁面上。", en: "A Co-President has to approve it before it actually appears on the public page." },
  // 我的故事
  "st.title":         { zh: "我的故事", en: "My story" },
  "st.lede":          { zh: "填完並且勾同意、Co-President 核可之後，\n      你會出現在<a href=\"../alumni/\">公開的校友頁</a>那張航線圖上：\n      從你的高中飛到你現在的城市。", en: "Once you fill this in, give consent and a Co-President approves it, you appear on the <a href=\"../alumni/\">public alumni page</a> route map: a flight from your high school to the city you are in now." },
  "st.name":          { zh: "公開顯示的名字", en: "Name shown publicly" },
  "st.nameNote":      { zh: "想遮字就寫成「張 O 睿」。空著的話用你上面填的姓名。", en: "To mask a character write it like \"張 O 睿\". Leave it blank to use the name above." },
  "st.school":        { zh: "高中", en: "High school" },
  "st.county":        { zh: "高中在哪個縣市", en: "County of the high school" },
  "st.countyNote":    { zh: "選了高中之後這一格會自己跳出來。\n      新北的高中選「台北」，圖上的起飛點畫在台北。\n      高中在澎湖、金門、馬祖的話先寫信給我們，那三個地方還不在圖上。", en: "This fills itself in after you pick a high school. For a school in New Taipei choose Taipei. The take-off point is drawn in Taipei. If your school was in Penghu, Kinmen or Matsu, email us first. Those are not on the map yet." },
  "st.city":          { zh: "現在的城市", en: "Current city" },
  "st.country":       { zh: "國家", en: "Country" },
  "st.countryPh":     { zh: "加拿大", en: "Canada" },
  "st.place":         { zh: "現在念哪間學校或在哪裡工作", en: "Where you study or work now" },
  "st.quote":         { zh: "你自己的一句話", en: "A line of your own" },
  "st.quotePh":       { zh: "現在換我回去講。台下坐的就是三年前的我。", en: "Now it is my turn to go back and speak. The students in the room are me three years ago." },
  "st.quoteNote":     { zh: "這一句在那一頁上用手寫體排出來，是整頁最重要的地方。", en: "This line is set in handwriting on that page. It is the most important part." },
  "st.note":          { zh: "一段介紹", en: "A short intro" },
  "st.notePh":        { zh: "兩三句：從哪裡出發、現在在做什麼。", en: "Two or three sentences: where you started, what you are doing now." },
  "st.en":            { zh: "英文版（選填）", en: "English version (optional)" },
  "st.enNote":        { zh: "那一頁有中英切換。沒填的話英文版就顯示中文這一份，畫面不會壞。", en: "That page has a Chinese/English switch. If you leave this blank the English version shows the Chinese text. Nothing breaks." },
  "st.schoolEn":      { zh: "高中（英文）", en: "High school (English)" },
  "st.countryEn":     { zh: "國家（英文）", en: "Country (English)" },
  "st.quoteEn":       { zh: "那一句話（英文）", en: "The line (English)" },
  "st.noteEn":        { zh: "介紹（英文）", en: "Intro (English)" },
  "st.consent":       { zh: "我同意把我的<b>名字、大頭照、高中、現在的城市與學校、上面那一句話與介紹</b>\n        放上<a href=\"../alumni/\">公開的校友頁</a>。那一頁任何人都看得到，也會被搜尋引擎收錄。\n        隨時可以把這個勾拿掉，拿掉就會從那一頁消失。", en: "I agree to put my <b>name, avatar, high school, current city and school, the line and the intro above</b> on the <a href=\"../alumni/\">public alumni page</a>. Anyone can see that page and search engines index it. You can untick this at any time and you disappear from that page." },
  // 刪除帳號
  "del.title":        { zh: "刪除帳號", en: "Delete account" },
  "del.sub":          { zh: "這個動作沒有辦法復原。", en: "This cannot be undone." },
  "del.what":         { zh: "刪掉的東西包括：你的姓名、學校、年級、訂閱設定，\n      以及你送出過的每一份申請與裡面的答案。", en: "This deletes your name, school, grade, subscription setting, and every application you submitted with its answers." },
  "del.mail":         { zh: "已經寄給你的信不會消失，那些在你自己的信箱裡。\n      如果你已經報名了某一場活動，刪掉帳號等於退出那一場。", en: "Emails already sent to you stay in your own inbox. If you signed up for an event, deleting your account withdraws you from it." },
  "del.type":         { zh: "確定的話，在下面打「刪除」兩個字", en: "To confirm, type delete below" },
  "del.typePh":       { zh: "刪除", en: "delete" },
  "del.deleting":     { zh: "刪除中…", en: "Deleting…" },
  "del.do":           { zh: "永久刪除我的帳號", en: "Permanently delete my account" },
  "del.no":           { zh: "先不要", en: "Not now" },
  // 存檔失敗、連不上
  "sf.half":          { zh: "你的資料存起來了，但「我的故事」那一段沒有存進去：{why}。再按一次「存起來」會重試那一段。", en: "Your details were saved, but the \"My story\" part was not: {why}. Press \"Save\" again to retry that part." },
  "err.save":         { zh: "存不起來：{why}", en: "Could not save: {why}" },
  "down.title":       { zh: "資料庫休眠中", en: "Database is asleep" },
  "down.lede":        { zh: "現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。", en: "We cannot reach the database right now. Email beyondtaiwan2020@gmail.com to have it woken up." },
  // main.js
  "m.avatarConfirm":  { zh: "你的大頭照會出現在全體進度牆上，其他 BT 幹部看得到{extra}。要繼續上傳嗎？", en: "Your avatar appears on the progress wall where other BT cadres can see it{extra}. Continue uploading?" },
  "m.avatarExtra":    { zh: "，而且因為你勾了公開，它也會出現在任何人都看得到的團隊頁上", en: ", and because you ticked public it also appears on the team page anyone can see" },
  "m.imgFail":        { zh: "這張圖讀不到，換一張試試。", en: "Could not read this image. Try another one." },
  "m.avatarOk":       { zh: "換好了。", en: "Changed." },
  "m.avatarFail":     { zh: "大頭照沒有存起來：", en: "The avatar was not saved: " },
  "m.three":          { zh: "姓名、學校、年級三個都要填。", en: "Fill in all three: name, school and grade." },
  "m.storyMissing":   { zh: "要公開的話這幾格還沒填：", en: "To publish, these are still empty: " },
  "m.pendingTeam":    { zh: "公開那一項還要等 Co-President 核可才會出現。", en: "The public team page entry still needs a Co-President's approval." },
  "m.pendingStory":   { zh: "你的故事還要等 Co-President 核可才會出現在校友頁上。", en: "Your story still needs a Co-President's approval before it appears on the alumni page." },
  "m.saved":          { zh: "存好了。{notes}", en: "Saved. {notes}" },
  "punct.sent":       { zh: "", en: " " },
  "m.typeDelete":     { zh: "要在那一格打「刪除」兩個字才會執行。", en: "Type delete in that box to proceed." },
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
