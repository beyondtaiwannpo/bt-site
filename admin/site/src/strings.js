// 後台「對外」那一組的字典：畫面上每一句中文與英文並排（2026-10-19，後台中英切換）。
// 做法與理由見 docs/2026-10-19-後台中英切換.md，怎麼加一句見 README「後台的中英切換」。
//
// **四個後台資料夾各有一支 strings.js**，不互相 import（跟 esc()、側欄那一段同一條規矩）。
// COMMON 那一段四份一模一樣（test/admin-hub.test.mjs 逐字比對），MINE 是這一組自己的畫面。
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
};

export const MINE = {
  // 資源的類型
  "res.pdf":          { zh: "PDF", en: "PDF" },
  "res.video":        { zh: "影片", en: "Video" },
  "res.slides":       { zh: "投影片", en: "Slides" },
  "res.sheet":        { zh: "表格", en: "Spreadsheet" },
  "res.book":         { zh: "手冊", en: "Handbook" },
  "res.link":         { zh: "連結", en: "Link" },
  // 團隊頁的核可
  "team.title":       { zh: "團隊頁", en: "Team page" },
  "team.lede":        { zh: "誰出現在對外的 /team/ 上。已經公開 {n} 人。", en: "Who appears on the public /team/ page. {n} published." },
  "team.note":        { zh: "核可之前確認兩件事：<br>\n      1. <b>他滿 18 歲了嗎。</b>未滿一律不放，不管職位。系統沒有生日欄位，這一條只有你擋得住。<br>\n      2. <b>隱私政策改了嗎。</b>現在的政策只說大頭照顯示在進度牆上，\n         對外公開是新用途。名字撤得下來，照片被搜尋引擎存過撤不乾淨。",
                        en: "Check two things before approving:<br>1. <b>Are they 18 or older?</b> Never publish a minor, whatever their role. There is no birthday field, so you are the only check.<br>2. <b>Has the privacy policy been updated?</b> The current policy only says avatars appear on the progress wall. Publishing them is a new use. A name can be taken down. A photo cached by a search engine cannot." },
  "team.approve":     { zh: "核可 {name}", en: "Approve {name}" },
  "team.onPage":      { zh: "在公開頁面上", en: "On the public page" },
  "team.notYet":      { zh: "還沒核可", en: "Not approved yet" },
  "team.noTeam":      { zh: "沒有填 team", en: "No team set" },
  "team.avatar":      { zh: "・有大頭照", en: "・has avatar" },
  "team.noAvatar":    { zh: "・沒有大頭照", en: "・no avatar" },
  "team.empty":       { zh: "還沒有人自己打勾", en: "Nobody has opted in yet" },
  "team.emptyHint":   { zh: "幹部要先到「設定」打勾同意出現在團隊頁，才會出現在這裡。", en: "Cadres have to opt in under Settings before they show up here." },
  // 校友頁的核可
  "stories.title":    { zh: "校友頁", en: "Alumni page" },
  "stories.lede":     { zh: "誰出現在對外的 /alumni/ 航線圖上。已經公開 {n} 人。", en: "Who appears on the public /alumni/ route map. {n} published." },
  "stories.note":     { zh: "核可之前確認三件事：<br>\n      1. <b>他滿 18 歲了嗎。</b>未滿一律不放。系統沒有生日欄位，這一條只有你擋得住。<br>\n      2. <b>他真的是 BT 校友嗎。</b>邀請碼可能被轉給別人。<br>\n      3. <b>這段文字可以用 BT 的名義公開嗎。</b>核可之後他再改那一句話或介紹，\n         系統會自動下架，重新回到這份清單上。",
                        en: "Check three things before approving:<br>1. <b>Are they 18 or older?</b> Never publish a minor. There is no birthday field, so you are the only check.<br>2. <b>Are they really a BT alumnus?</b> Invite codes can be passed on.<br>3. <b>Can this text go out under BT's name?</b> If they edit the quote or the story after approval, it is taken down automatically and comes back to this list." },
  "stories.waiting":  { zh: "等核可", en: "Waiting for approval" },
  "stories.noCounty": { zh: "沒填縣市・不會出現在圖上", en: "No county・will not appear on the map" },
  "stories.approvedAt": { zh: "核可於：{d}", en: "Approved: {d}" },
  "stories.updatedAt":  { zh: "內容最後改過：{d}", en: "Last edited: {d}" },
  "stories.empty":    { zh: "還沒有人勾同意", en: "Nobody has given consent yet" },
  "stories.emptyHint":{ zh: "幹部與校友要先到「設定」把故事填完並勾同意，才會出現在這裡。", en: "Cadres and alumni have to finish their story and give consent under Settings before they show up here." },
  // 資源
  "res.published":    { zh: "已發布", en: "Published" },
  "res.draft":        { zh: "還在寫", en: "Draft" },
  "res.noBlurb":      { zh: "還沒寫介紹", en: "No description yet" },
  "res.title":        { zh: "資源", en: "Resources" },
  "res.lede":         { zh: "BT 產出的免費資源。這裡放的是<b>一條連結</b>，不是檔案。", en: "Free resources BT has made. Each entry is <b>a link</b>, not a file." },
  "res.new":          { zh: "加一個資源", en: "Add a resource" },
  "res.readonly":     { zh: "你可以看，但改不動。資源由 Director 與 Co-President 維護。", en: "You can look but not edit. Resources are maintained by Directors and Co-Presidents." },
  "res.empty":        { zh: "還沒有任何資源", en: "No resources yet" },
  "res.emptyHint":    { zh: "加一條 Google Drive 或 YouTube 的連結，寫一句給高中生看的介紹，狀態改成已發布就會出現在 /resources/。", en: "Add a Google Drive or YouTube link, write one line for a high school student, set it to published and it appears on /resources/." },
  "res.editTitle":    { zh: "改一個資源", en: "Edit resource" },
  "res.newTitle":     { zh: "加一個資源", en: "Add a resource" },
  "res.back":         { zh: "回資源清單", en: "Back to resources" },
  "res.name":         { zh: "名稱", en: "Name" },
  "res.namePh":       { zh: "申請文書怎麼開頭", en: "How to start an application essay" },
  "res.blurb":        { zh: "介紹（公開，沒登入的人也看得到，Google 也看得到）", en: "Description (public, visible without signing in, and to Google)" },
  "res.blurbPh":      { zh: "這是什麼、為什麼有用。寫給一個第一次聽到 BT 的高中生看。", en: "What it is and why it helps. Write for a high school student hearing about BT for the first time." },
  "res.kind":         { zh: "類型", en: "Type" },
  "res.ord":          { zh: "排序（小的在前）", en: "Order (smaller first)" },
  "res.team":         { zh: "哪一個 team 維護", en: "Maintained by which team" },
  "res.status":       { zh: "狀態", en: "Status" },
  "res.draftOpt":     { zh: "還在寫（外面看不到）", en: "Draft (not public)" },
  "res.publishedOpt": { zh: "已發布", en: "Published" },
  "res.url":          { zh: "連結（Google Drive、YouTube、Canva…）", en: "Link (Google Drive, YouTube, Canva…)" },
  "res.urlNote":      { zh: "發布之前，<b>用無痕視窗打開這條連結自己點一次</b>。\n      Drive 的分享權限如果設成「只有我」，這裡完全看不出來，\n      而學生看到的會是一頁「你需要存取權」。",
                        en: "Before publishing, <b>open the link in a private window and click it yourself</b>. If the Drive share setting is \"only me\" nothing here will show it, and students will see a \"you need access\" page." },
  // 信件文案
  "mail.guardian":    { zh: "家長告知信", en: "Guardian notice" },
  "mail.guardian.when": { zh: "學生送出申請、而且填了家長信箱的時候", en: "when a student submits and gives a guardian email" },
  "mail.interview":   { zh: "邀請面試", en: "Interview invitation" },
  "mail.interview.when": { zh: "你按下「邀請面試」的時候", en: "when you press \"Interview\"" },
  "mail.accepted":    { zh: "錄取通知", en: "Acceptance" },
  "mail.accepted.when": { zh: "你按下「錄取」的時候", en: "when you press \"Accepted\"" },
  "mail.rejected":    { zh: "婉拒", en: "Decline" },
  "mail.rejected.when": { zh: "你按下「婉拒」的時候", en: "when you press \"Declined\"" },
  "mail.invite":      { zh: "邀請信", en: "Invite" },
  "mail.meeting_invite": { zh: "會議：邀請", en: "Meeting: invite" },
  "mail.meeting_invite.when": { zh: "在時間看板排一場會的時候，寄給每一位出席的人（附 .ics）", en: "when a meeting is scheduled from the availability board; goes to each attendee with an .ics" },
  "mail.meeting_reminder": { zh: "會議：開會前一天提醒", en: "Meeting: reminder the day before" },
  "mail.meeting_reminder.when": { zh: "開會前 24 小時，寄給還沒說不能到的出席者", en: "24 hours before the meeting, to attendees who have not declined" },
  "mail.varsMeeting":  { zh: "可以用的代換符號：{name} 收信的人、{title} 標題、{when} 他自己時區的時間、{agenda} 議程、{doc} 會議紀錄連結、{link} 回覆連結。", en: "Placeholders: {name}, {title}, {when} (recipient's time zone), {agenda}, {doc} (notes link), {link} (reply link)." },
  "mail.sampleMeeting":{ zh: "預覽用的範例：寄給 {name} 的「{title}」。", en: "Preview sample: \"{title}\" sent to {name}." },
  "mail.request_new":  { zh: "需求單：給 Marketing 的通知", en: "Request: notice to Marketing" },
  "mail.request_new.when": { zh: "有幹部送了一張行銷需求單的時候，寄給需求工作區裡每一個「管」的人", en: "when a cadre sends a Marketing request; goes to everyone with Manage on the requests workspace" },
  "mail.request_done": { zh: "需求單：做完了", en: "Request: done" },
  "mail.request_done.when": { zh: "Marketing 把一張需求單標成做完了的時候，寄給送單的人", en: "when Marketing marks a request done; goes to the requester" },
  "mail.varsRequest":  { zh: "可以用的代換符號：{requester} 送單的人、{title} 標題、{needed_by} 什麼時候要、{link} 直達那張單、{reply} 回覆（做完那封才有）。", en: "Placeholders: {requester}, {title}, {needed_by}, {link} (opens the request), {reply} (Done email only)." },
  "mail.sampleRequest":{ zh: "預覽用的範例：{name} 送的「{title}」。", en: "Preview sample: \"{title}\" sent by {name}." },
  "mail.invite.when": { zh: "你在「人與權限 → 邀請」寄邀請的時候", en: "when you send an invite under People → Invites" },
  "mail.varsInvite":  { zh: "可以用五個代換符號：<b>{name}</b> 名字、<b>{position}</b> 職位、<b>{term}</b> 屆別、<b>{link}</b> 連結、<b>{sender}</b> 邀請的人。\n      打錯或刪掉不會壞掉，那個位置會空著。<b>{link}</b> 一定要在，不然他點不進來。",
                        en: "Five placeholders: <b>{name}</b>, <b>{position}</b>, <b>{term}</b>, <b>{link}</b>, <b>{sender}</b>. A typo leaves the spot blank. Keep <b>{link}</b> in, or they cannot get in." },
  "mail.sampleInvite":{ zh: "用「{name}」與「{position}」當範例。", en: "Using \"{name}\" and \"{position}\" as the example." },
  "mail.title":       { zh: "信件文案", en: "Email copy" },
  "mail.lede":        { zh: "系統寄出去的五封信。只有 Co-President 與 Senior Adviser 改得動。", en: "The five emails the system sends. Only Co-Presidents and Senior Advisers can edit them." },
  "mail.whenList":    { zh: "{when}", en: "Sent {when}" },
  "mail.subject":     { zh: "主旨：{s}", en: "Subject: {s}" },
  "mail.noSubject":   { zh: "（還沒有）", en: "(none yet)" },
  "mail.editThis":    { zh: "改這一封", en: "Edit" },
  "mail.editLede":    { zh: "{when}寄出。左邊改，右邊就是寄出去的樣子。", en: "Sent {when}. Edit on the left; the right shows what goes out." },
  "mail.back":        { zh: "回信件清單", en: "Back to emails" },
  "mail.subjectLabel":{ zh: "主旨", en: "Subject" },
  "mail.body":        { zh: "內文", en: "Body" },
  "mail.vars":        { zh: "可以用兩個代換符號：<b>{姓名}</b> 與 <b>{活動名稱}</b>。\n      打錯或刪掉不會壞掉，那個位置會空著 —— 右邊的預覽會直接讓你看到。",
                        en: "You can use two placeholders: <b>{姓名}</b> and <b>{活動名稱}</b>. A typo or a deletion does not break anything, the spot is just left blank, and the preview on the right shows it." },
  "mail.previewTitle":{ zh: "寄出去會長這樣", en: "What gets sent" },
  "mail.sample":      { zh: "用「{name}」與「{title}」當範例。", en: "Using \"{name}\" and \"{title}\" as the example." },
  "mail.noSubjectPrev": { zh: "（沒有主旨）", en: "(no subject)" },
  "mail.tailNote":    { zh: "灰色那一段是<b>系統自己加的，改不掉</b>。「不要回覆這封信」是必要資訊：\n      那個信箱沒有人看，按回覆會被退回，而收信的人只會覺得沒有人理他。",
                        en: "The grey part is <b>added by the system and cannot be changed</b>. \"Do not reply\" is essential: nobody reads that mailbox, replies bounce, and the recipient would just feel ignored." },
  // main.js 與 data.js 的訊息
  "err.tplLoad":      { zh: "文案載不到：", en: "Could not load the email copy: " },
  "err.rosterLoad":   { zh: "名單載不到：", en: "Could not load the list: " },
  "err.storiesLoad":  { zh: "校友名單載不到：", en: "Could not load the alumni list: " },
  "err.resLoad":      { zh: "資源載不到：", en: "Could not load resources: " },
  "err.mailBoth":     { zh: "主旨與內文都要寫。", en: "Fill in both subject and body." },
  "err.resName":      { zh: "資源要有名字。", en: "Give the resource a name." },
  "err.resUrl":       { zh: "資源要有一條連結，不然這一列沒有用。", en: "The resource needs a link, or the entry is useless." },
  "msg.tplSaved":     { zh: "存好了。下一封寄出去的信就是這個文案。", en: "Saved. The next email sent uses this copy." },
  "confirm.delRes":   { zh: "刪掉這個資源？外面那一頁上就不見了。", en: "Delete this resource? It disappears from the public page." },
  // data.js 的 says()：兩個特例（其他代碼在 data.js 的 SAYS 表裡，中英並排）
  "says.mailNotConfigured": { zh: "信件還沒設定好", en: "Email is not set up" },
  "says.mailFix":     { zh: "　修法：到 Supabase 的 Vault 把那兩個 secret 的名字改成 RESEND_API_KEY 與 BT_MAIL_FROM（大小寫與底線要一樣），並確認 pg_net 已經打開。",
                        en: " Fix: in Supabase Vault rename the two secrets to RESEND_API_KEY and BT_MAIL_FROM (case and underscores must match) and make sure pg_net is enabled." },
  "says.inviteExists":{ zh: "已經有一組「{code}」了。大小寫和前後空白不算差別，換一組碼。", en: "There is already a code \"{code}\". Case and surrounding spaces do not count as different. Pick another code." },
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
