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
  // 最常做的三件事（2026-11-27 第二版：側欄的「+ 新增」拿掉，回到首頁最上面，每個 team 的頁上也有一組）
  "q.aria":           { zh: "最常做的事", en: "Things you do most" },
  "q.rq":             { zh: "跟 Marketing 提需求", en: "Ask Marketing" },
  "q.mt":             { zh: "記一場會議", en: "Log a meeting" },
  "q.sch":            { zh: "排一場會", en: "Schedule a meeting" },
  // 等你處理的事（2026-11-14，首頁與後台「待辦」合併成一張清單）
  "home.wait":        { zh: "等你處理", en: "Waiting for you" },
  "home.waitLede":    { zh: "照日期排，最急的在最上面。點一行就到那件事。", en: "Sorted by date, most urgent first. Tap a row to go there." },
  "home.waitNone":    { zh: "現在沒有等你處理的事。", en: "Nothing is waiting for you right now." },
  "home.pp":          { zh: "我的護照", en: "My passport" },
  "home.ppN":         { zh: "蓋了 {n} 格，一共 {t} 格", en: "{n} of {t} stamps" },
  "home.ppGo":        { zh: "打開護照", en: "Open passport" },
  "w.today":          { zh: "今天", en: "Today" },
  "w.tomorrow":       { zh: "明天", en: "Tomorrow" },
  "w.late":           { zh: "{d}，已經過了", en: "{d}, overdue" },
  "w.form":           { zh: "要你填的表單", en: "Form for you" },
  "w.fb":             { zh: "活動回饋", en: "Event feedback" },
  "w.apps":           { zh: "報名等審核", en: "Sign-ups to review" },
  "w.appsN":          { zh: "{n} 份還沒看", en: "{n} not reviewed yet" },
  "w.rqMine":         { zh: "派給你的需求", en: "Request assigned to you" },
  "w.rqNew":          { zh: "新的行銷需求", en: "New Marketing request" },
  "w.rqNobody":       { zh: "還沒有人接", en: "Nobody has taken it yet" },
  "w.rqSt":           { zh: "現在是「{st}」", en: "Now: {st}" },
  "w.post":           { zh: "等你核可的貼文", en: "Post to approve" },
  "w.postSub":        { zh: "大學介紹貼文", en: "College intro post" },
  "w.event":          { zh: "你的活動快到了", en: "Your event is coming up" },
  "w.eventCheckin":   { zh: "簽到在這裡", en: "Check-in is here" },
  "w.eventOpen":      { zh: "打開這一場", en: "Open the event" },
  "w.myrq":           { zh: "你送的需求", en: "Your request" },
  "w.team":           { zh: "團隊頁等核可", en: "Team page" },
  "w.teamT":          { zh: "{n} 個人等你核可", en: "{n} waiting for approval" },
  "w.teamSub":        { zh: "核可之後才會出現在網站上", en: "They appear on the site once approved" },
  "w.stories":        { zh: "校友故事等核可", en: "Alumni stories" },
  "w.storiesT":       { zh: "{n} 篇等你核可", en: "{n} waiting for approval" },
  "w.ready":          { zh: "活動等上線", en: "Event ready to publish" },
  "w.readySub":       { zh: "team 標了準備好，等你放上網站", en: "The team marked it ready; publish it on the site" },
  "w.roster":         { zh: "幹部名單", en: "Roster" },
  "w.rosterT":        { zh: "{n} 位還沒填 team", en: "{n} without a team" },
  "w.rosterSub":      { zh: "沒有 team 的人在各 team 那一頁找不到自己", en: "People without a team cannot find their own team's things" },
  "w.mail":           { zh: "寄不出去的信", en: "Emails stuck" },
  "w.mailT":          { zh: "{n} 封試過還沒寄出去", en: "{n} tried but not sent" },
  "w.mailSub":        { zh: "看錯誤訊息、再寄一次", en: "See the error and send again" },
  "rq.st.submitted":  { zh: "已送出", en: "Submitted" },
  "rq.st.in_progress":{ zh: "進行中", en: "In progress" },
  "rq.st.in_review":  { zh: "待審核", en: "In review" },
  "rq.st.published":  { zh: "已發布", en: "Published" },
  "rq.st.withdrawn":  { zh: "收回了", en: "Withdrawn" },
  "rq.st.rejected":   { zh: "退件", en: "Rejected" },
  "home.today":       { zh: "今天是 {date}，時間照你的時區（{tz}）。", en: "Today is {date}. Times are in your time zone ({tz})." },
  "home.reply":       { zh: "等你回覆", en: "Waiting for your reply" },
  "home.replyLede":   { zh: "按一下讓排會的人知道你會不會到。", en: "One tap tells the organizer whether you're coming." },
  "home.next":        { zh: "接下來", en: "Coming up" },

  // team 的頁（2026-11-23，/home/#team=<team>）。側欄「我的工作區」點一個 team 進來。
  "team.kicker":      { zh: "工作區", en: "Workspace" },
  "team.ledeRank":    { zh: "你是 {rank}，這個 team 的每一樣你都改得動。", en: "You are {rank}, so you can change everything on this team." },
  "team.ledeLevel":   { zh: "你在這個 team 是「{lv}」。{what}", en: "Your level on this team is {lv}. {what}" },
  "team.whatView":    { zh: "看得到 team 自己的東西，改不動。", en: "You can see the team's own things but not change them." },
  "team.whatEdit":    { zh: "team 自己的活動、會議、資源你改得動。專案要另外開給你，下面有標。", en: "You can change the team's own events, meetings and resources. Projects are opened to you one by one, as marked below." },
  "team.whatManage":  { zh: "這個 team 的每一樣你都改得動，也可以加人。", en: "You can change everything on this team and add people." },
  "team.ledeSome":    { zh: "這個 team 只開了幾樣給你。下面標「只能看」的是沒開給你的。", en: "Only some of this team's things are open to you. Anything marked View only below is not." },
  "team.ledeView":    { zh: "你沒被派進這個 team 的工作區，下面的東西只能看。想改的話找這個 team 的 Director。", en: "You are not assigned to this team's workspace, so everything below is view only. To edit, ask this team's Director." },
  "team.director":    { zh: "Director：{names}", en: "Director: {names}" },
  "team.noDirector":  { zh: "Director：還沒有", en: "Director: none yet" },
  "team.people":      { zh: "誰在這個 team", en: "People on this team" },
  "team.loading":     { zh: "載入中…", en: "Loading…" },
  "team.gone":        { zh: "這一塊現在載不到，重新整理再試一次。", en: "This part could not load. Reload and try again." },
  "team.pj":          { zh: "專案", en: "Projects" },
  "team.pjNone":      { zh: "這個 team 還沒有專案。", en: "No projects on this team yet." },
  "team.pjNew":       { zh: "開一個專案", en: "Create a project" },
  "team.pjForms":     { zh: "{n} 份報名表", en: "{n} sign-up {n:form|forms}" },
  "team.pjNoEvents":  { zh: "這個專案還沒有活動。", en: "No events in this project yet." },
  "team.pjArchived":  { zh: "收起來了", en: "Archived" },
  "team.ev":          { zh: "不在專案裡的活動", en: "Events not in a project" },
  "team.evNone":      { zh: "沒有。這個 team 的活動都在專案裡，或還沒開活動。", en: "None. This team's events are all inside projects, or it has none yet." },
  "team.evNew":       { zh: "開一場活動", en: "Create an event" },
  "team.evOld":       { zh: "另外有 {n} 場舊活動只在紀錄裡。", en: "{n} older {n:event exists|events exist} only in Records." },
  "team.noDate":      { zh: "日期還沒定", en: "no date yet" },
  "team.fm":          { zh: "計畫與招募的申請表", en: "Program and recruitment applications" },
  "team.fmNone":      { zh: "沒有。活動的報名表在那一場活動的頁面上。", en: "None. An event's sign-up form is on that event's page." },
  "team.fmGo":        { zh: "到申請表清單", en: "Go to applications" },
  "team.rs":          { zh: "資源", en: "Resources" },
  "team.rsNone":      { zh: "這個 team 還沒有放資源。", en: "This team has not added any resources yet." },
  "team.rsGo":        { zh: "到資源庫", en: "Go to Resources" },
  "team.yours":       { zh: "你的", en: "Yours" },
  "team.viewOnly":    { zh: "只能看", en: "View only" },
  "team.lv.view":     { zh: "看", en: "View" },
  "team.lv.edit":     { zh: "改", en: "Edit" },
  "team.lv.manage":   { zh: "管", en: "Manage" },
  "team.st.draft":    { zh: "草稿", en: "Draft" },
  "team.st.ready":    { zh: "準備好了", en: "Ready" },
  "team.st.published":{ zh: "對外中", en: "Live" },
  "team.st.archived": { zh: "撤下了", en: "Unpublished" },
  "team.st.open":     { zh: "開放中", en: "Open" },
  "team.st.closed":   { zh: "關了", en: "Closed" },
  "home.nothing":     { zh: "接下來沒有排給你的會。", en: "Nothing scheduled for you yet." },
  "home.allClear":    { zh: "都回覆完了。", en: "All replied." },
  "home.forms":       { zh: "要你填的表單", en: "Forms for you" },
  "home.formsLede":   { zh: "點進去填，每份填一次就好。", en: "Tap one to fill it in. Each takes one go." },
  "home.formCloses":  { zh: "{date} 截止", en: "Closes {date}" },
  "home.formOpen":    { zh: "沒有截止時間", en: "No deadline" },
  "home.do":          { zh: "我要…", en: "I want to…" },
  // 我帶的 mentee（2026-12-07）：配對只在紀錄後台，mentor 自己在網站上看不到帶的是誰。這一區從 rc_my_pairs() 來。
  "home.mentees":     { zh: "我帶的 mentee", en: "My mentees" },
  "home.feedback":    { zh: "該填的回饋", en: "Feedback to fill in" },
  "home.fbHint":      { zh: "你參加過的活動還開著的回饋表。填過的打勾。", en: "Open feedback forms for events you were at. Filled ones are ticked." },
  "home.myMentor":    { zh: "我的 mentor", en: "My mentor" },
  "home.pairTerm":    { zh: "{event}（{term}）", en: "{event} ({term})" },
  "home.pairSince":   { zh: "配對日 {d}", en: "paired {d}" },
  "home.pairEnded":   { zh: "已結束 {d}", en: "ended {d}" },
  "home.fill":        { zh: "填 {title}", en: "Fill in {title}" },
  "home.filled":      { zh: "{title}：填過了", en: "{title}: done" },
  "home.pairHint":    { zh: "check-in 的連結在這裡，填過的會打勾。要改配對找 Mentorship 的 Director。", en: "Your check-in links are here; the ones you have filled in are ticked. To change a pairing, ask the Mentorship Director." },
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
  "m.join":           { zh: "加入 Google Meet", en: "Join Google Meet" },
  "m.onGcal":         { zh: "已在你的 Google 日曆上", en: "Already on your Google Calendar" },
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
  "cal.pickMonth":    { zh: "點一個日期就能排會。", en: "Click a date to schedule a meeting." },
  "cal.pickWeek":     { zh: "拖一段時間就能排會，點一下是一小時。", en: "Drag across a time to schedule a meeting. A single click gives one hour." },
  "cal.empty":        { zh: "這段時間沒有東西。", en: "Nothing in this range." },
  "cal.title":        { zh: "行事曆", en: "Calendar" },
  // 某一天（2026-11-26）：點月曆或週曆上的日期打開。每半小時底色越深，有空的人越多；能排會的人點一格就排。
  "cal.day":          { zh: "日", en: "Day" },
  "day.lede":         { zh: "底色越深，那半小時有空的人越多。點一格排一場會。", en: "The darker a half hour, the more people are free. Click one to schedule a meeting." },
  "day.ledeView":     { zh: "底色越深，那半小時有空的人越多。數字是照每個人在「我的時間」填的。", en: "The darker a half hour, the more people are free. Counts come from what each person filled in under My time." },
  "day.everyone":     { zh: "所有人", en: "Everyone" },
  "day.free":         { zh: "{n} 人有空", en: "{n} free" },
  "day.freeNames":    { zh: "{n} 人有空：{names}", en: "{n} free: {names}" },
  "day.loading":      { zh: "正在讀大家有空的時間⋯", en: "Loading when people are free…" },
  "day.failed":       { zh: "讀不到大家有空的時間，底色先不畫。會議照常顯示。", en: "Couldn't load when people are free, so there is no shading. Meetings still show." },
  "day.noTz":         { zh: "{n} 個人還沒設定時區，算不進來：{names}", en: "{n} {n:person has|people have} no time zone yet, so they aren't counted: {names}" },
  "day.myTime":       { zh: "改我自己有空的時間", en: "Edit my own free times" },
  "day.past":         { zh: "已經過去了", en: "Already past" },
  // 排一場會（從某一天點一格打開）。
  "sch.title":        { zh: "排一場會", en: "Schedule a meeting" },
  "sch.start":        { zh: "開始", en: "Starts" },
  "sch.scope":        { zh: "範圍", en: "Scope" },
  "sch.board":        { zh: "整個 BT", en: "Whole BT" },
  "sch.required":     { zh: "這場是", en: "This meeting is" },
  "sch.req1":         { zh: "必到", en: "Required" },
  "sch.req0":         { zh: "選擇參加", en: "Optional" },
  "sch.head":         { zh: "標題", en: "Headline" },
  "sch.headPh":       { zh: "例如：Curriculum 週會", en: "e.g. Curriculum weekly" },
  "sch.agenda":       { zh: "議程", en: "Agenda" },
  "sch.agendaPh":     { zh: "例如：海報進度、嘖嘖頁分工", en: "e.g. poster progress, crowdfunding page" },
  "sch.message":      { zh: "給大家的留言（會放進邀請）", en: "Message to everyone (goes in the invite)" },
  "sch.messagePh":    { zh: "例如：請先看完提案再來", en: "e.g. Please read the proposal before we meet" },
  "sch.doc":          { zh: "會議紀錄（Docs 連結，可以先空）", en: "Notes (Docs link, optional)" },
  "sch.who":          { zh: "邀請的人（勾了 {n} 位）", en: "Invite ({n} ticked)" },
  "sch.find":         { zh: "找名字", en: "Find by name" },
  "sch.all":          { zh: "全勾看到的", en: "Tick all shown" },
  "sch.none":         { zh: "全部取消", en: "Untick all" },
  "sch.isFree":       { zh: "有空", en: "free" },
  "sch.partFree":     { zh: "部分時間有空", en: "free for part" },
  // 2026-11-27：每一個人後面的標，跟著選的時間變。
  "sch.busy":         { zh: "沒空", en: "busy" },
  "sch.noTimes":      { zh: "沒填時間", en: "no times yet" },
  "sch.keyFree":      { zh: "整段都有空，", en: "the whole time," },
  "sch.keyPart":      { zh: "只有其中一段，", en: "only part of it," },
  "sch.keyBusy":      { zh: "這段時間沒空，", en: "not at this time," },
  "sch.keyNone":      { zh: "還沒在時間看板填過，不知道。", en: "hasn't filled in Availability, so we can't tell." },
  "sch.failed":       { zh: "讀不到名單與大家有空的時間，先排不了。重新整理再試一次。", en: "Couldn't load the member list and free times, so you can't schedule yet. Reload and try again." },
  "sch.date":         { zh: "日期", en: "Date" },
  "sch.end":          { zh: "結束", en: "Ends" },
  "sch.len":          { zh: "長度 {len}", en: "Length: {len}" },
  "sch.lenHM":        { zh: "{h} 小時 {m} 分", en: "{h} h {m} min" },
  "sch.lenH":         { zh: "{h} 小時", en: "{h} h" },
  "sch.lenM":         { zh: "{m} 分鐘", en: "{m} min" },
  "sch.dayView":      { zh: "看這一天每半小時誰有空", en: "See who is free each half hour" },
  "sch.pastPick":     { zh: "那個時間已經過了，選之後的時間。", en: "That time has passed. Pick a later time." },
  "sch.nobody":       { zh: "沒有符合的人", en: "Nobody matches" },
  "sch.send":         { zh: "排會並寄邀請（{n} 人）", en: "Schedule and invite ({n})" },
  "sch.sending":      { zh: "排會中⋯", en: "Scheduling…" },
  "sch.note":         { zh: "會用 BT 的 Google 帳號開這場會，自動加一個 Google Meet 連結，Google 會寄邀請給每一個人。邀請裡有標題、時間、議程、你的留言、誰排的、邀請了誰。每個人也會收到一封網站的信，可以回覆會不會到。之後要改時間或名單，到後台的會議那一頁改。", en: "BT's Google account hosts the meeting, adds a Google Meet link, and Google sends everyone an invite with the headline, time, agenda, your message, who scheduled it and who is invited. Each person also gets an email from the site to reply whether they can come. To change the time or the list later, use Meetings in Admin." },
  "sch.needPeople":   { zh: "至少勾一個人。", en: "Tick at least one person." },
  "sch.needTitle":    { zh: "會議要有標題。", en: "The meeting needs a headline." },
  "sch.sent":         { zh: "排好了，邀請寄給 {n} 個人。", en: "Scheduled. Invites are going to {n} {n:person|people}." },
  "m.message":        { zh: "留言", en: "Message" },
  "m.by":             { zh: "排會的人", en: "Scheduled by" },

  "err.load":         { zh: "沒載進來：", en: "Could not load: " },
  "err.rsvp":         { zh: "沒記下來：", en: "Not saved: " },
  "err.sch":          { zh: "沒排成：", en: "Not scheduled: " },
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
