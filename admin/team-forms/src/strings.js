// 後台「內部表單」那一組的字典（2026-11-29）：畫面上每一句中文與英文並排（2026-10-19，後台中英切換）。
// 做法與理由見 docs/2026-10-19-後台中英切換.md，怎麼加一句見 README「後台的中英切換」。
//
// **四個後台資料夾各有一支 strings.js**，不互相 import（跟 esc()、側欄那一段同一條規矩）。
// COMMON 那一段四份一模一樣（test/admin-hub.test.mjs 逐字比對），MINE 是這一組自己的畫面。
// **五個後台資料夾各有一支 strings.js**（2026-11-08 起多了 admin/finance/）。
//
// 規矩：
//   - 鍵是英文、用點分段（畫面.用途）。中文與英文寫在同一行，加一句不用讀程式。
//   - 鍵以 err. 開頭的是「沒做成」的訊息，畫面會把它畫成橘的（isErr 看這個，不看字尾）。
//   - 帶數字用 {n}；英文單複數用 {n:form|forms}（1 的時候取前面，其他取後面）。中文沒有單複數，照常寫。
//   - 值裡面可以有 HTML（<b>、<span>），跟原本寫在樣板裡一樣。**使用者填的字要先 esc() 再餵進 {}**。

// **七個後台資料夾各有一支 strings.js**（2026-11-29 起多了 admin/team-forms/）。

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
  // 2026-12-01 BT Records。
  "why.records":      { zh: "只有 Co-President、Senior Adviser、被派進「BT Records」的人，與活動工作區「改」以上的人進得去", en: "Co-Presidents, Senior Advisers, people assigned to BT Records, and event workspace editors only" },
  // 走錯地方、連不上
  "notCadre.title":   { zh: "這一頁是給幹部用的", en: "This page is for cadres" },
  "notCadre.lede":    { zh: "你的帳號不是幹部帳號（學員、校友、實習生都一樣），後台看不到。", en: "Your account is not a cadre account (students, alumni and interns alike), so the admin is not available." },
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
  "ws.long.records":  { zh: "BT Records（人、活動、回饋、去向）", en: "BT Records (people, events, feedback, outcomes)" },
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
  "noAccess.title":   { zh: "這一頁只有建得了表單的人、或某一份表單的讀者看得到", en: "This page is for form builders and readers" },
  "noAccess.lede":    { zh: "要建表單，請 Co-President 到「人與權限 → 誰能改什麼」把你加進「內部表單（誰能建）」。要看某一份的答案，請那份表單的建立者把你加進讀者。", en: "To build forms, ask a Co-President to add you to \"Team forms (who can create)\" under People, Who can edit what. To read a form's answers, ask its creator to add you as a reader." },
  "noAccess.back":    { zh: "回要填的表單", en: "Back to forms to fill in" },
  // 題型
  "type.short":       { zh: "短答", en: "Short text" },
  "type.long":        { zh: "長答", en: "Long text" },
  "type.single":      { zh: "單選", en: "Single choice" },
  "type.multi":       { zh: "多選", en: "Multiple choice" },
  "type.scale":       { zh: "量表", en: "Scale" },
  // 狀態
  "st.draft":         { zh: "草稿", en: "Draft" },
  "st.open":          { zh: "收答案中", en: "Open" },
  "st.closed":        { zh: "已收起來", en: "Closed" },
  "st.draftHint":     { zh: "只有編輯的人看得到，填的人還看不到。", en: "Only editors can see it. Members can't see it yet." },
  "st.openHint":      { zh: "名單上的人在首頁看得到、填得了。", en: "Everyone on the list sees it on their home page and can fill it in." },
  "st.closedHint":    { zh: "不收新的答案。填過的人還看得到自己的。", en: "No new answers. People who answered can still see their own." },
  // 職級
  "rank.president":   { zh: "Co-President", en: "Co-Presidents" },
  "rank.senior_adviser": { zh: "Senior Adviser", en: "Senior Advisers" },
  "rank.director":    { zh: "Director", en: "Directors" },
  "rank.adviser":     { zh: "顧問", en: "Advisers" },
  "rank.member":      { zh: "Associate", en: "Associates" },

  // ── 要填的表單 ──
  "fill.title":       { zh: "要填的表單", en: "Forms to fill in" },
  "fill.lede":        { zh: "Co-President 或其他幹部發給你的表單。每一份填一次，填完看得到自己寫了什麼。誰看得到你的答案，每一份表單上面都有寫。", en: "Forms sent to you by the Co-Presidents or other members. Fill each one in once; afterwards you can see what you wrote. Each form says who can read your answers." },
  "fill.todo":        { zh: "還沒填的", en: "Still to fill in" },
  "fill.none":        { zh: "現在沒有要你填的表單", en: "Nothing to fill in right now" },
  "fill.noneHint":    { zh: "有新的表單發給你，這裡跟首頁都會出現。", en: "When a form is sent to you, it shows up here and on your home page." },
  "fill.go":          { zh: "去填", en: "Fill it in" },
  "fill.closes":      { zh: "{when} 截止", en: "Closes {when}" },
  "fill.mine":        { zh: "你填過的", en: "Your answers" },
  "fill.mineNone":    { zh: "還沒有填過任何一份。", en: "You haven't answered any form yet." },
  "fill.sent":        { zh: "{when} 送出", en: "Sent {when}" },
  "fill.see":         { zh: "看我的答案", en: "See my answers" },
  "fill.change":      { zh: "改我的答案", en: "Change my answers" },
  "fill.back":        { zh: "回要填的表單", en: "Back to forms" },
  "fill.who":         { zh: "誰看得到你的答案：Co-President、Senior Adviser{more}。", en: "Who can read your answers: the Co-Presidents and Senior Advisers{more}." },
  "fill.whoMore":     { zh: "，加上這份表單的建立者與它設的讀者", en: ", plus this form's creator and the readers it names" },
  "fill.anon":        { zh: "這一份是匿名的：讀答案的人看不到是誰寫的。", en: "This form is anonymous: readers can't see who wrote what." },
  "fill.required":    { zh: "必填", en: "Required" },
  "fill.submit":      { zh: "送出", en: "Send" },
  "fill.update":      { zh: "更新我的答案", en: "Update my answers" },
  "fill.sending":     { zh: "送出中…", en: "Sending…" },
  "fill.done":        { zh: "你 {when} 送出了這一份。下面是你寫的。", en: "You sent this on {when}. Here is what you wrote." },
  "fill.doneEdit":    { zh: "你 {when} 送出了這一份。收答案期間可以回來改。", en: "You sent this on {when}. You can change it while the form is open." },
  "fill.closedNow":   { zh: "這一份已經收起來了，不收新的答案。", en: "This form is closed and no longer takes answers." },
  "fill.preview":     { zh: "預覽：你不在填的名單上，這是名單上的人會看到的樣子。送不出去。", en: "Preview: you are not on the list, so this is what members will see. You can't send it." },
  "fill.noAnswer":    { zh: "（沒答）", en: "(no answer)" },
  "fill.pick":        { zh: "選一個", en: "Pick one" },
  "msg.sent":         { zh: "送出了，謝謝。", en: "Sent. Thank you." },
  "msg.updated":      { zh: "答案更新了。", en: "Your answers are updated." },

  // ── 建表單與看結果 ──
  "build.title":      { zh: "建表單與看結果", en: "Build forms & see results" },
  "build.lede":       { zh: "建一份表單、選要發給誰、選誰看得到答案。Co-President 與 Senior Adviser 永遠看得到每一份；其他人要被寫進那一份的讀者才看得到。", en: "Build a form, choose who gets it and who can read the answers. Co-Presidents and Senior Advisers can always read every form; anyone else has to be named as a reader on that form." },
  "build.new":        { zh: "建一份新的", en: "New form" },
  "build.none":       { zh: "還沒有你管得到的表單", en: "No forms you can manage yet" },
  "build.noneHint":   { zh: "按「建一份新的」開始。", en: "Start with New form." },
  "build.cantCreate": { zh: "你看得到下面這幾份，但建不了新的。要建，請 Co-President 到「人與權限 → 誰能改什麼」把你加進「內部表單（誰能建）」。", en: "You can see the forms below but can't create new ones. To create, ask a Co-President to add you to \"Team forms (who can create)\" under People, Who can edit what." },
  "build.count":      { zh: "{n} / {of} 人填了", en: "{n} of {of} answered" },
  "build.by":         { zh: "{name} 建的", en: "by {name}" },
  "build.reader":     { zh: "你是讀者", en: "You can read" },
  "build.newTitle":   { zh: "新的表單", en: "New form" },
  "build.titlePh":    { zh: "例如：2026-27 第二季幹部回饋", en: "e.g. 2026-27 Q2 check-in" },
  "build.create":     { zh: "建立", en: "Create" },
  "msg.created":      { zh: "建好了。先加題目，再到「發給誰」選人，最後打開。", en: "Created. Add questions, choose who gets it, then open it." },

  // 編輯畫面
  "ed.back":          { zh: "回表單清單", en: "Back to forms" },
  "ed.tab.questions": { zh: "題目與設定", en: "Questions & settings" },
  "ed.tab.people":    { zh: "發給誰、誰看得到", en: "Who gets it, who reads it" },
  "ed.tab.results":   { zh: "結果", en: "Results" },
  "ed.tab.log":       { zh: "改過什麼", en: "History" },
  "ed.open":          { zh: "打開，開始收答案", en: "Open it" },
  "ed.close":         { zh: "收起來", en: "Close it" },
  "ed.reopen":        { zh: "再打開", en: "Reopen" },
  "ed.toDraft":       { zh: "退回草稿", en: "Back to draft" },
  "ed.delete":        { zh: "刪掉這份表單", en: "Delete this form" },
  "ed.deleteAsk":     { zh: "整份連所有答案一起刪掉，救不回來。確定？", en: "This deletes the form and every answer. It can't be undone. Sure?" },
  "ed.readonly":      { zh: "你是這一份的讀者，看得到設定與答案，改不動。", en: "You are a reader on this form: you can see the settings and answers but can't change them." },
  "ed.settings":      { zh: "設定", en: "Settings" },
  "ed.name":          { zh: "表單名稱", en: "Title" },
  "ed.intro":         { zh: "開頭的說明", en: "Intro" },
  "ed.introPh":       { zh: "這份是做什麼的、大概要花幾分鐘、答案會拿去做什麼", en: "What this is for, how long it takes, what the answers are used for" },
  "ed.closes":        { zh: "截止時間（可以不填）", en: "Closes at (optional)" },
  "ed.allowEdit":     { zh: "收答案期間，填過的人可以回來改自己的答案", en: "While open, people can come back and change their answers" },
  "ed.anon":          { zh: "匿名：讀答案的人看不到是誰寫的", en: "Anonymous: readers can't see who wrote what" },
  "ed.anonLocked":    { zh: "已經有人填了，不能改回具名（填的人是看到「匿名」才寫的）。", en: "People have already answered, so this can't go back to named (they answered because it said anonymous)." },
  "ed.questions":     { zh: "題目", en: "Questions" },
  "ed.qNote":         { zh: "改了就存。選項一行一個。有人答過的題目不能刪、不能換題型，改字可以。", en: "Saves as you change it. One option per line. Questions with answers can't be deleted or change type, but you can reword them." },
  "ed.noQ":           { zh: "還沒有題目", en: "No questions yet" },
  "ed.noQHint":       { zh: "底下選一種題型加第一題。", en: "Pick a type below to add the first question." },
  "ed.addQ":          { zh: "加一題", en: "Add a question" },
  "ed.newQ":          { zh: "新的題目", en: "New question" },
  "ed.opt1":          { zh: "選項一", en: "Option 1" },
  "ed.opt2":          { zh: "選項二", en: "Option 2" },
  "q.label":          { zh: "題目", en: "Question" },
  "q.help":           { zh: "補充說明（可以不填）", en: "Help text (optional)" },
  "q.type":           { zh: "題型", en: "Type" },
  "q.req":            { zh: "必填", en: "Required" },
  "q.opts":           { zh: "選項（一行一個）", en: "Options (one per line)" },
  "q.min":            { zh: "從", en: "From" },
  "q.max":            { zh: "到", en: "To" },
  "q.minLabel":       { zh: "最小那一端寫什麼（可以不填）", en: "Label for the low end (optional)" },
  "q.maxLabel":       { zh: "最大那一端寫什麼（可以不填）", en: "Label for the high end (optional)" },
  "q.up":             { zh: "往上移", en: "Move up" },
  "q.down":           { zh: "往下移", en: "Move down" },
  "q.del":            { zh: "刪掉這一題", en: "Delete" },
  "q.answered":       { zh: "有人答過", en: "Has answers" },

  // 發給誰、誰看得到
  "aud.recipient":    { zh: "發給誰（誰要填）", en: "Who gets it (who fills it in)" },
  "aud.recipientHint":{ zh: "打開之後，名單上的人在首頁看得到這一份。", en: "Once open, everyone on this list sees it on their home page." },
  "aud.reader":       { zh: "誰看得到所有人的答案", en: "Who can read everyone's answers" },
  "aud.readerHint":   { zh: "Co-President、Senior Adviser 與這份表單的建立者永遠看得到，不用加。", en: "Co-Presidents, Senior Advisers and this form's creator can always read it. No need to add them." },
  "aud.readerWarn":   { zh: "注意：選了整個 team 或某一級，裡面每個人都讀得到每一份答案，包括別人寫他的那幾句。", en: "Careful: picking a whole team or rank lets everyone in it read every answer, including what others wrote about them." },
  "aud.editor":       { zh: "誰改得動這份表單", en: "Who can edit this form" },
  "aud.editorHint":   { zh: "改得動的人也看得到所有答案。只有建立者與 Co-President 改得動這一張名單。", en: "Editors can also read every answer. Only the creator and Co-Presidents can change this list." },
  "aud.all":          { zh: "全部幹部", en: "All members" },
  "aud.ranks":        { zh: "職級", en: "Ranks" },
  "aud.teams":        { zh: "Team", en: "Teams" },
  "aud.people":       { zh: "指定的人", en: "Named people" },
  "aud.search":       { zh: "打名字找人", en: "Type a name to find someone" },
  "aud.add":          { zh: "加", en: "Add" },
  "aud.remove":       { zh: "拿掉 {name}", en: "Remove {name}" },
  "aud.nobodyYet":    { zh: "還沒選任何人。", en: "Nobody picked yet." },
  "aud.count":        { zh: "現在算起來是 {n} 個人", en: "That's {n} {n:person|people} right now" },
  "aud.countSee":     { zh: "看是哪些人", en: "See who" },
  "aud.save":         { zh: "存這一張名單", en: "Save this list" },
  "aud.unsaved":      { zh: "還沒存", en: "Not saved yet" },
  "aud.readonly":     { zh: "只有建立者與 Co-President 改得動這一張。", en: "Only the creator and Co-Presidents can change this list." },
  "aud.always":       { zh: "永遠看得到：Co-President、Senior Adviser、建立者 {owner}", en: "Always: Co-Presidents, Senior Advisers and the creator, {owner}" },
  "msg.audSaved":     { zh: "名單存好了。", en: "List saved." },

  // 結果
  "res.answered":     { zh: "填了", en: "Answered" },
  "res.pending":      { zh: "還沒填", en: "Not yet" },
  "res.of":           { zh: "名單上 {n} 人", en: "{n} {n:person|people} on the list" },
  "res.summary":      { zh: "每一題", en: "Question by question" },
  "res.avg":          { zh: "平均 {avg}（{n} 人答，{min} 到 {max}）", en: "Average {avg} ({n} answered, {min} to {max})" },
  "res.nAnswers":     { zh: "{n} 個人寫了", en: "{n} {n:person|people} wrote something" },
  "res.other":        { zh: "（選項外的答案）", en: "(not one of the options)" },
  "res.none":         { zh: "還沒有人填", en: "No answers yet" },
  "res.noneHint":     { zh: "打開表單、名單上的人送出之後，答案會出現在這裡。", en: "Answers appear here once the form is open and people send it." },
  "res.each":         { zh: "每一份", en: "Each response" },
  "res.who":          { zh: "誰", en: "Who" },
  "res.team":         { zh: "Team", en: "Team" },
  "res.when":         { zh: "送出時間", en: "Submitted" },
  "res.pendingList":  { zh: "還沒填的人", en: "Who hasn't answered" },
  "res.allDone":      { zh: "名單上的人都填了。", en: "Everyone on the list has answered." },
  "res.anon":         { zh: "這一份是匿名的，名字不顯示，順序也打亂了。", en: "This form is anonymous: no names, and the order is shuffled." },
  "res.csv":          { zh: "下載 CSV", en: "Download CSV" },
  "res.showAll":      { zh: "看全部 {n} 則", en: "Show all {n}" },
  "msg.csv":          { zh: "下載了 {n} 份答案。", en: "Downloaded {n} {n:response|responses}." },

  // 紀錄
  "log.none":         { zh: "還沒有紀錄。", en: "Nothing yet." },
  "log.create":       { zh: "建立", en: "Created" },
  "log.status":       { zh: "狀態", en: "Status" },
  "log.anonymous":    { zh: "匿名", en: "Anonymous" },
  "log.recipient":    { zh: "發給誰", en: "Who gets it" },
  "log.reader":       { zh: "誰看得到", en: "Readers" },
  "log.editor":       { zh: "誰改得動", en: "Editors" },
  "log.link":         { zh: "接到帳號", en: "Linked a response" },

  // 匯入

  // 錯誤
  "err.load":         { zh: "讀不到資料：", en: "Could not load: " },
  "err.send":         { zh: "送不出去：", en: "Could not send: " },
  "err.create":       { zh: "建不了：", en: "Could not create: " },
  "err.status":       { zh: "改不了狀態：", en: "Could not change the status: " },
  "err.needTitle":    { zh: "表單要有名稱。", en: "The form needs a title." },
  "err.needRequired": { zh: "第 {n} 題是必填的。", en: "Question {n} is required." },

  // 資料庫回的代碼
  "says.notCreator":  { zh: "你還不能建表單。請 Co-President 到「人與權限 → 誰能改什麼」把你加進「內部表單（誰能建）」。", en: "You can't create forms yet. Ask a Co-President to add you to \"Team forms (who can create)\" under People." },
  "says.notEditor":   { zh: "你改不動這份表單。", en: "You can't edit this form." },
  "says.notOwner":    { zh: "只有這份表單的建立者與 Co-President 做得了這件事。", en: "Only this form's creator and the Co-Presidents can do that." },
  "says.notReader":   { zh: "你不在這份表單的讀者名單上，看不到答案。", en: "You aren't a reader on this form, so you can't see the answers." },
  "says.notForYou":   { zh: "這份表單不是發給你的。", en: "This form wasn't sent to you." },
  "says.notFound":    { zh: "找不到這份表單，可能被刪掉了。", en: "Form not found. It may have been deleted." },
  "says.closed":      { zh: "這份表單已經收起來或過了截止時間。", en: "This form is closed or past its closing time." },
  "says.already":     { zh: "你已經填過這一份了。", en: "You've already answered this form." },
  "says.alreadyOne":  { zh: "這個人在這份表單已經有一份答案了。", en: "This person already has a response on this form." },
  "says.required":    { zh: "有必填的題目還沒填。", en: "A required question is still empty." },
  "says.badOption":   { zh: "有一題的答案不在選項裡，重新整理再選一次。", en: "One answer isn't among the options. Refresh and pick again." },
  "says.badScale":    { zh: "量表的答案超出範圍。", en: "A scale answer is out of range." },
  "says.tooLong":     { zh: "有一題寫太長了（短答 500 字、長答一萬字以內）。", en: "An answer is too long (500 characters for short text, 10,000 for long text)." },
  "says.needTitle":   { zh: "表單要有名稱。", en: "The form needs a title." },
  "says.needLabel":   { zh: "每一題都要有題目。", en: "Every question needs text." },
  "says.needOptions": { zh: "單選與多選至少要兩個選項。", en: "Choice questions need at least two options." },
  "says.badScaleDef": { zh: "量表要從 0 或 1 開始，最多到 10。", en: "A scale starts at 0 or 1 and goes up to at most 10." },
  "says.typeLocked":  { zh: "有人答過的題目不能換題型。要換就加一題新的。", en: "A question with answers can't change type. Add a new question instead." },
  "says.hasAnswers":  { zh: "有人答過的題目刪不掉。", en: "A question with answers can't be deleted." },
  "says.anonLocked":  { zh: "已經有人填了，不能從匿名改回具名。", en: "People have already answered, so it can't go back from anonymous to named." },
  "says.needQuestions": { zh: "至少要有一題才能打開。", en: "Add at least one question before opening." },
  "says.needRecipients":{ zh: "要先在「發給誰、誰看得到」選人才能打開。", en: "Choose who gets it first, under \"Who gets it, who reads it\"." },
  "says.hasResponses":{ zh: "已經有人填了，不能退回草稿。要停就收起來。", en: "People have answered, so it can't go back to draft. Close it instead." },
  "says.editorAll":   { zh: "「誰改得動」不能選全部幹部。", en: "\"Who can edit\" can't be all members." },
  "says.badPerson":   { zh: "找不到那個人（可能不是幹部了）。", en: "That person wasn't found (they may no longer be a member)." },
  "says.needName":    { zh: "有一列沒有名字。", en: "A row has no name." },
  "says.noTables":    { zh: "內部表單的資料表還不在，要先在 Supabase 跑 2026-11-29-team-forms.sql。", en: "The team-forms tables aren't there yet. Run 2026-11-29-team-forms.sql in Supabase first." },
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
