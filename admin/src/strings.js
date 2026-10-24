// 後台「申請」那一組的字典：畫面上每一句中文與英文並排（2026-10-19，後台中英切換）。
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
  "mp.add":           { zh: "加一個人", en: "Add a person" },
  "mp.who":           { zh: "誰", en: "Who" },
  "mp.whoPh":         { zh: "打名字找人", en: "Type a name" },
  "mp.addGo":         { zh: "加進去", en: "Add" },
  "mp.addNote":       { zh: "打兩個字就縮到幾個名字；已經在裡面的人不會出現。只能派幹部。", en: "Two letters narrow it to a few names; people already here are not listed. Cadres only." },
  "msg.mpAssigned":   { zh: "{name} 加進去了（{level}）。", en: "{name} added ({level})." },
  "msg.mpLevel":      { zh: "{name}：{level}。", en: "{name}: {level}." },
  "msg.mpRemoved":    { zh: "{name} 已經移出。", en: "{name} removed." },
  "confirm.mpRemove": { zh: "把 {name} 從這個工作區移出？", en: "Remove {name} from this workspace?" },
  "err.mpLoad":       { zh: "成員載不到：", en: "Could not load the people: " },
  "err.mpPick":       { zh: "先打一個名字。", en: "Type a name first." },
  "err.mpNoSuch":     { zh: "名單上沒有這個名字，從提示裡選一個。", en: "No one has that name; pick one from the suggestions." },
  "err.mpAssign":     { zh: "派不進去：", en: "Could not add: " },
  "err.mpRemove":     { zh: "移不出去：", en: "Could not remove: " },
};

export const MINE = {
  // 題型與表單狀態
  "type.short":       { zh: "短答", en: "Short answer" },
  "type.short.hint":  { zh: "一行字。姓名、學校、連結。", en: "One line. Name, school, link." },
  "type.long":        { zh: "長答", en: "Long answer" },
  "type.long.hint":   { zh: "一段字。「你為什麼想申請」那一類。", en: "A paragraph. \"Why do you want to apply\" and the like." },
  "type.single":      { zh: "單選", en: "Single choice" },
  "type.single.hint": { zh: "從幾個選項裡挑一個。", en: "Pick one of several options." },
  "type.multi":       { zh: "多選", en: "Multiple choice" },
  "type.multi.hint":  { zh: "可以挑很多個。", en: "Pick as many as apply." },
  "status.draft":     { zh: "還在寫", en: "Draft" },
  "status.draft.hint":{ zh: "只有你的 team 看得到，外面看不到。", en: "Only your team can see it. Not public." },
  "status.open":      { zh: "開放中", en: "Open" },
  "status.open.hint": { zh: "出現在 /apply/，任何人都申請得了。", en: "Listed on /apply/. Anyone can apply." },
  "status.closed":    { zh: "已關閉", en: "Closed" },
  "status.closed.hint":{ zh: "不再收件，收到的申請還在。", en: "No longer accepting. Existing applications stay." },
  "kind.program":     { zh: "給高中生的計畫", en: "Program for high school students" },
  "kind.board":       { zh: "幹部招募", en: "Cadre recruitment" },
  "lang.zh":          { zh: "中文", en: "Chinese" },
  "lang.en":          { zh: "English", en: "English" },
  // 開新表單
  "newForm.title":    { zh: "開一份新的申請表", en: "New form" },
  "newForm.sub":      { zh: "先取名字，題目進去再加。開出來是「還在寫」，外面看不到。", en: "Name it first, add questions inside. It starts as a draft and is not public." },
  "newForm.name":     { zh: "名字（之後改得動）", en: "Name (you can change it later)" },
  "newForm.namePh":   { zh: "2027 暑期探索營", en: "2027 Summer Discovery Camp" },
  "newForm.creating": { zh: "建立中…", en: "Creating…" },
  "newForm.create":   { zh: "建立", en: "Create" },
  "form.team":        { zh: "哪一個 team 的", en: "Which team" },
  "form.kind":        { zh: "種類", en: "Kind" },
  // 表單清單
  "forms.title":      { zh: "申請表", en: "Forms" },
  "forms.lede":       { zh: "開申請表、看收到的申請。你看得到的是自己 team 的表單。", en: "Create forms and review applications. You see your own team's forms." },
  "forms.new":        { zh: "開一份新的申請表", en: "New form" },
  "forms.noTeam":     { zh: "沒有指定 team", en: "No team set" },
  "forms.count":      { zh: "收到 <span class=\"count\">{n}</span> 件", en: "<span class=\"count\">{n}</span> received" },
  "forms.unhandled":  { zh: "，其中 {n} 件還沒處理", en: ", {n} waiting" },
  "forms.seeApps":    { zh: "看收到的申請", en: "View applications" },
  "forms.editForm":   { zh: "改這份表單", en: "Edit form" },
  "forms.viewForm":   { zh: "看這份表單", en: "View form" },
  "forms.perTeam":    { zh: "{n} 份", en: "{n} {n:form|forms}" },
  "forms.readonly":   { zh: "你可以看，但改不動。開表單與審核是 Director 與 Co-President 的事。", en: "You can look but not edit. Creating forms and reviewing is for Directors and Co-Presidents." },
  "forms.empty":      { zh: "還沒有任何申請表", en: "No forms yet" },
  "forms.emptyCan":   { zh: "開第一份，加幾題，狀態改成開放中，就會出現在 /apply/。", en: "Create the first one, add a few questions, set it to open, and it appears on /apply/." },
  "forms.emptyCannot":{ zh: "等 Director 或 Co-President 開第一份。", en: "Wait for a Director or Co-President to create the first one." },
  // 一份表單的頁首與分頁
  "tabs.aria":        { zh: "這份表單", en: "This form" },
  "tabs.apps":        { zh: "申請", en: "Applications" },
  "tabs.form":        { zh: "設定", en: "Settings" },
  "tabs.event":       { zh: "活動", en: "Event" },
  "form.received":    { zh: "，收到 {n} 件", en: ", {n} received" },
  "form.back":        { zh: "回申請表清單", en: "Back to forms" },
  // 表單設定
  "form.settings":    { zh: "設定", en: "Settings" },
  "form.name":        { zh: "表單名稱", en: "Form name" },
  "form.intro":       { zh: "說明（申請人會看到，寫在題目上面）", en: "Description (applicants see it above the questions)" },
  "form.lang":        { zh: "語言", en: "Language" },
  "form.opens":       { zh: "開放時間（不填就是立刻）", en: "Opens (blank means right away)" },
  "form.closes":      { zh: "截止時間（不填就是不自動關）", en: "Closes (blank means it never closes on its own)" },
  "form.notify":      { zh: "預計通知日", en: "Expected notice date" },
  "form.cal":         { zh: "面試預約連結（Cal.com）", en: "Interview booking link (Cal.com)" },
  "form.status":      { zh: "狀態", en: "Status" },
  "form.deleteForm":  { zh: "刪掉這份表單", en: "Delete this form" },
  "form.questions":   { zh: "題目", en: "Questions" },
  "form.qNote":       { zh: "只有四種題型，不做跳題，也不做檔案上傳。申請人的姓名、學校、年級與 email\n      系統自己會帶，<b>不用在這裡再問一次</b>。",
                        en: "Four question types only, no branching, no file upload. The applicant's name, school, grade and email are collected automatically, <b>so do not ask for them again here</b>." },
  "form.noQ":         { zh: "還沒有題目", en: "No questions yet" },
  "form.noQHint":     { zh: "一份表單至少要有一題才能開放。", en: "A form needs at least one question before it can open." },
  "form.addQ":        { zh: "加一題", en: "Add a question" },
  "q.up":             { zh: "往上移", en: "Move up" },
  "q.down":           { zh: "往下移", en: "Move down" },
  "q.required":       { zh: "必填", en: "Required" },
  "q.del":            { zh: "刪", en: "Delete" },
  // 一題
  "q.editTitle":      { zh: "改一題", en: "Edit question" },
  "q.newTitle":       { zh: "加一題", en: "Add a question" },
  "q.lede":           { zh: "申請人看到的就是下面這幾個字。", en: "Applicants see exactly the words below." },
  "q.back":           { zh: "回這份表單", en: "Back to form" },
  "q.label":          { zh: "題目", en: "Question" },
  "q.labelPh":        { zh: "你為什麼想參加？", en: "Why do you want to join?" },
  "q.help":           { zh: "補充說明（選填，顯示在題目下面的小字）", en: "Help text (optional, shown in small type under the question)" },
  "q.helpPh":         { zh: "三五句話就好，不用寫成作文", en: "A few sentences is enough, no essay needed" },
  "q.type":           { zh: "題型", en: "Type" },
  "q.opts":           { zh: "選項（一行一個，只有單選與多選用得到）", en: "Options (one per line, single and multiple choice only)" },
  "q.optsPh":         { zh: "第一個選項&#10;第二個選項", en: "First option&#10;Second option" },
  "q.req":            { zh: "這一題必填", en: "Required" },
  "q.save":           { zh: "存這一題", en: "Save question" },
  // 審核
  "app.received":     { zh: "還沒處理", en: "Waiting" },
  "app.interview":    { zh: "邀請面試", en: "Interview" },
  "app.accepted":     { zh: "錄取", en: "Accepted" },
  "app.rejected":     { zh: "婉拒", en: "Declined" },
  "apps.pick":        { zh: "選取 {name}", en: "Select {name}" },
  "apps.noSchool":    { zh: "沒填學校", en: "No school given" },
  "apps.submitted":   { zh: "{when} 送出", en: "submitted {when}" },
  "apps.guardian":    { zh: "家長信箱：", en: "Guardian email: " },
  "apps.answers":     { zh: "看他寫了什麼", en: "Read the answers" },
  "apps.blank":       { zh: "（沒填）", en: "(blank)" },
  "apps.selected":    { zh: "選了 {n} 個人", en: "{n} selected" },
  "apps.bulkHint":    { zh: "勾起來就可以一次處理很多人", en: "Tick people to handle several at once" },
  "apps.unselectAll": { zh: "全部取消", en: "Clear selection" },
  "apps.selectAll":   { zh: "全選這一頁", en: "Select all shown" },
  "apps.all":         { zh: "全部", en: "All" },
  "apps.emptyFilter": { zh: "這一格裡沒有人", en: "Nobody in this filter" },
  "apps.emptyFilterHint": { zh: "換一個篩選看看。", en: "Try another filter." },
  "apps.empty":       { zh: "還沒有人申請", en: "No applications yet" },
  "apps.emptyHint":   { zh: "表單開放之後，送出的申請會出現在這裡。", en: "Once the form is open, submitted applications show up here." },
  // 還沒寄出去的信
  "mail.k":           { zh: "信件", en: "Email" },
  "mail.pending":     { zh: "還有 <b>{n}</b> 封信沒有寄出去。", en: "<b>{n}</b> {n:email|emails} not sent yet." },
  "mail.stuck":       { zh: "其中 {n} 封試過但失敗了：{err}", en: "{n} tried and failed: {err}" },
  "mail.noErr":       { zh: "沒有錯誤訊息", en: "no error message" },
  "mail.sending":     { zh: "寄送中…", en: "Sending…" },
  "mail.sendNow":     { zh: "現在寄出去", en: "Send now" },
  // 簽到
  "checkin.readonly": { zh: "你可以看，但點不了。簽到是 Director 與 Co-President 的事。", en: "You can look but not tick. Check-in is for Directors and Co-Presidents." },
  "checkin.title":    { zh: "簽到", en: "Check-in" },
  "checkin.arrived":  { zh: "{name} 到了", en: "{name} arrived" },
  "checkin.here":     { zh: "已到", en: "Here" },
  "checkin.notYet":   { zh: "還沒到", en: "Not yet" },
  "checkin.empty":    { zh: "還沒有人錄取", en: "Nobody accepted yet" },
  "checkin.emptyHint":{ zh: "錄取之後，名單會出現在這裡，活動當天逐一點名。", en: "Once people are accepted the list shows here. Tick them off on the day." },
  "checkin.hint":     { zh: "錄取 {n} 人，<b>到了 {here} 人</b>", en: "{n} accepted, <b>{here} here</b>" },
  "checkin.notice":   { zh: "寄一封信給這些人", en: "Email these people" },
  // 寄一封信
  "to.accepted":      { zh: "錄取的人", en: "Accepted" },
  "to.interview":     { zh: "邀請面試的人", en: "Invited to interview" },
  "to.received":      { zh: "還沒處理的人", en: "Waiting" },
  "notice.title":     { zh: "寄一封信", en: "Send an email" },
  "notice.to":        { zh: "寄給誰", en: "To" },
  "notice.subject":   { zh: "主旨", en: "Subject" },
  "notice.subjectPh": { zh: "探索營行前通知", en: "Camp pre-event notice" },
  "notice.body":      { zh: "內容（純文字，換行就是換行）", en: "Body (plain text, line breaks stay)" },
  "notice.bodyPh":    { zh: "時間、地點、要帶什麼。", en: "Time, place, what to bring." },
  "notice.note":      { zh: "收信人的名字與「不要回覆這封信」那一段系統會自己加，\n      <b>你只要寫中間那一段</b>。",
                        en: "The recipient's name and the \"do not reply\" footer are added automatically. <b>Write only the middle part</b>." },
  "notice.sending":   { zh: "寄出中…", en: "Sending…" },
  "notice.send":      { zh: "寄給這 {n} 個人", en: "Send to {n} {n:person|people}" },
  "notice.pickFirst": { zh: "先選要寄給誰", en: "Choose recipients first" },
  "notice.backCheckin": { zh: "回簽到", en: "Back to check-in" },
  "notice.checkin":   { zh: "簽到", en: "Check-in" },
  // 首頁
  "hub.title":        { zh: "總覽", en: "Overview" },
  // 2026-10-23 批 4：你的存取、頂欄四項是什麼
  "hub.access":       { zh: "你的存取", en: "Your access" },
  "hub.accessSenior": { zh: "你看得到、改得動後台每一個工作區，不用派。", en: "You can see and change every workspace in the admin; no assignment needed." },
  "hub.accessNone":   { zh: "你還沒被派進任何工作區，所以後台只有這一頁跟你自己的東西。找你的 Director 或 Co-President，他們在自己的頁面上就能把你加進去。", en: "You are not assigned to any workspace yet, so the admin shows only this page and your own things. Ask your Director or a Co-President; they can add you from their own page." },
  "hub.accessNoDirs": { zh: "各 team 的 Director 還沒有人公開在團隊頁上，直接問 Co-President。", en: "No Director is published on the team page yet; ask a Co-President directly." },
  "hub.goForms":      { zh: "去申請表", en: "Open forms" },
  "hub.goRes":        { zh: "去資源", en: "Open resources" },
  "hub.goWall":       { zh: "進度牆", en: "Progress wall" },
  "hub.goAdmin":      { zh: "後台", en: "Admin" },
  "card.apps.see":    { zh: "去看", en: "View" },
  "team.people":      { zh: "誰在這個 team 的工作區", en: "People in this team's workspaces" },
  "team.peopleHint":  { zh: "成員在申請表或資源那一頁的「誰在做」裡改", en: "Members are managed under \"Who works on\" on the forms or resources page" },
  "hub.who":          { zh: "{name}，{board}，{teams}。你管得到的事都在這一頁。", en: "{name}, {board}, {teams}. Everything you manage is on this page." },
  "hub.todo":         { zh: "今天要處理的事", en: "To handle today" },
  "hub.none":         { zh: "今天沒有待辦", en: "Nothing to handle today" },
  "hub.noneHint":     { zh: "申請、信件、核可都處理完了。", en: "Applications, emails and approvals are all done." },
  "hub.teams":        { zh: "你的 team", en: "Your teams" },
  "card.apps":        { zh: "還沒處理的申請", en: "Applications waiting" },
  "card.apps.unit":   { zh: "件", en: "" },
  "card.apps.none":   { zh: "沒有要處理的", en: "nothing waiting" },
  "card.apps.go":     { zh: "去審", en: "Review" },
  "card.mail":        { zh: "還沒寄出去的信", en: "Emails not sent" },
  "card.mail.unit":   { zh: "封", en: "" },
  "card.mail.hint":   { zh: "狀態改了就會排一封信", en: "Each status change queues an email" },
  "card.mail.done":   { zh: "全部寄出去了", en: "all sent" },
  "card.team":        { zh: "等你核可上團隊頁", en: "Waiting for team page approval" },
  "card.team.unit":   { zh: "人", en: "" },
  "card.team.hint":   { zh: "本人勾了，等第二把鑰匙", en: "They opted in, waiting for your key" },
  "card.approve":     { zh: "去核可", en: "Approve" },
  "card.stories":     { zh: "等你核可上校友頁", en: "Waiting for alumni page approval" },
  "card.stories.hint":{ zh: "故事填完也勾了同意", en: "Story written and consent given" },
  "card.interns":     { zh: "這一屆的 intern", en: "Interns this term" },
  "card.interns.unit":{ zh: "位", en: "" },
  "card.interns.hint":{ zh: "平均蓋了 {n} 格", en: "{n} stamps each on average" },
  "card.interns.none":{ zh: "還沒有 intern 進來", en: "no interns yet" },
  "card.interns.go":  { zh: "看格子", en: "View boxes" },
  "card.cadres":      { zh: "幹部", en: "Cadres" },
  "card.cadres.unit": { zh: "位", en: "" },
  "card.cadres.noTeam": { zh: "其中 {n} 位還沒填 team", en: "{n} without a team" },
  "card.cadres.ok":   { zh: "team 都填了", en: "everyone has a team" },
  "card.cadres.go":   { zh: "看名單", en: "View roster" },
  "kpi.gone":         { zh: "載不到", en: "Not loaded" },
  "kpi.goneHint":     { zh: "重新整理再試一次", en: "Refresh and try again" },
  "kpi.go":           { zh: "去看", en: "Open" },
  "team.none":        { zh: "你還沒有 team", en: "You have no team yet" },
  "team.noneHint":    { zh: "到「設定」勾你的 team，這裡就會有你的位置。", en: "Tick your team under Settings and your place appears here." },
  "team.members":     { zh: "{n} 人", en: "{n} {n:person|people}" },
  "team.forms":       { zh: "申請表", en: "Forms" },
  "team.formsSum":    { zh: "{n} 份，{open} 份開放中", en: "{n} {n:form|forms}, {open} open" },
  "team.formsRec":    { zh: "，<b>{n} 件還沒處理</b>", en: ", <b>{n} waiting</b>" },
  "team.noneYet":     { zh: "還沒有", en: "none yet" },
  "team.res":         { zh: "資源", en: "Resources" },
  "team.resSum":      { zh: "{n} 條，{pub} 條已發布", en: "{n} {n:item|items}, {pub} published" },
  "team.director":    { zh: "Director：", en: "Director: " },
  "team.noDirector":  { zh: "還沒指定", en: "not assigned" },
  // main.js 的訊息與確認
  "err.open":         { zh: "打不開：", en: "Could not open: " },
  "err.list":         { zh: "清單載不到：", en: "Could not load the list: " },
  "err.checkin":      { zh: "點不了：", en: "Could not tick: " },
  "err.send":         { zh: "寄不出去：", en: "Could not send: " },
  "err.create":       { zh: "開不出來：", en: "Could not create: " },
  "err.reorder":      { zh: "換不了順序：", en: "Could not reorder: " },
  "err.noticeBoth":   { zh: "主旨與內容都要寫。", en: "Fill in both subject and body." },
  "err.noTeamProfile":{ zh: "你的 profile 還沒有填 team，開不出表單。先到「設定」填一下。", en: "Your profile has no team yet, so you cannot create a form. Fill it in under Settings first." },
  "err.formName":     { zh: "表單要有名字。", en: "Give the form a name." },
  "err.pickTeam":     { zh: "要選一個 team。", en: "Choose a team." },
  "err.noQuestions":  { zh: "這份表單還沒有題目，不能開放。先加一題。", en: "This form has no questions yet, so it cannot open. Add one first." },
  "err.qEmpty":       { zh: "題目不能空白。", en: "The question cannot be blank." },
  "err.qOpts":        { zh: "單選與多選至少要兩個選項，一行一個。", en: "Single and multiple choice need at least two options, one per line." },
  "err.noForm":       { zh: "找不到這份表單，可能已經被刪掉了。", en: "Form not found. It may have been deleted." },
  "confirm.notice":   { zh: "要把這封信寄給 {n} 個人嗎？\n\n主旨：{sub}\n\n信寄出去就收不回來了。", en: "Send this email to {n} {n:person|people}?\n\nSubject: {sub}\n\nOnce sent it cannot be taken back." },
  "confirm.decide":   { zh: "要把選起來的 {n} 個人標成「{word}」嗎？\n\n每一個人都會收到一封信。信寄出去就收不回來了。", en: "Mark the {n} selected {n:person|people} as \"{word}\"?\n\nEach of them gets an email. Once sent it cannot be taken back." },
  "confirm.delFormApps": { zh: "這份表單已經收到 {n} 件申請。刪掉它，那些申請與答案會一起永久消失。確定嗎？", en: "This form has {n} {n:application|applications}. Deleting it deletes them and their answers for good. Are you sure?" },
  "confirm.delForm":  { zh: "刪掉這份表單？沒有辦法復原。", en: "Delete this form? This cannot be undone." },
  "confirm.delQ":     { zh: "刪掉這一題？已經送出的申請裡，這一題的答案會一起消失。", en: "Delete this question? Its answers in submitted applications disappear too." },
  "mail.sentN":       { zh: "，寄出 {n} 封", en: ", sent {n}" },
  "mail.sentFailed":  { zh: "，寄出 {sent} 封、{failed} 封失敗", en: ", sent {sent}, {failed} failed" },
  "mail.notSent":     { zh: "。信還沒寄出去：", en: ". Emails not sent yet: " },
  "mail.sentNote":    { zh: "，寄出 {n} 封信", en: ", sent {n} {n:email|emails}" },
  "mail.failedNote":  { zh: "，{n} 封沒寄成功", en: ", {n} failed" },
  "msg.queued":       { zh: "排了 {n} 封信{note}。", en: "Queued {n} {n:email|emails}{note}." },
  "msg.sent":         { zh: "寄出 {n} 封。", en: "Sent {n}." },
  "msg.sentSome":     { zh: "寄出 {sent} 封，{failed} 封失敗。", en: "Sent {sent}, {failed} failed." },
  "msg.decided":      { zh: "{n} 個人標成「{word}」{note}。", en: "{n} marked as \"{word}\"{note}." },
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
