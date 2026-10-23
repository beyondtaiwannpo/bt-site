// 後台「護照」那一組的字典：畫面上每一句中文與英文並排（2026-10-19，後台中英切換）。
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
  "rail.foot":        { zh: "對外七頁（首頁、關於、計畫、做過什麼、合作、團隊、Alumni）的文字在 HTML 檔裡，不在後台。改法見 README「對外的內容頁」。",
                        en: "The seven public pages (home, about, programs, impact, partner, team, alumni) live in HTML files, not here. See README, the section on the public content pages." },
  "board.member":     { zh: "Associate", en: "Associate" },
  "board.director":   { zh: "Director", en: "Director" },
  "board.president":  { zh: "Co-President", en: "Co-President" },
  "why.president":    { zh: "只有 Co-President 進得去", en: "Co-Presidents only" },
  "why.passports":    { zh: "只有被派進護照工作區的人、Co-President 與 Senior Adviser 進得去", en: "Only people assigned to a passport workspace, Co-Presidents and Senior Advisers" },
  "board.senior":     { zh: "Senior Adviser", en: "Senior Adviser" },
  "why.senior":       { zh: "只有 Co-President 與 Senior Adviser 進得去", en: "Co-Presidents and Senior Advisers only" },
  // 走錯地方、連不上
  "notCadre.title":   { zh: "這一頁是給幹部用的", en: "This page is for cadres" },
  "notCadre.lede":    { zh: "你的帳號是學員，後台看不到。", en: "Your account is a student account, so the admin is not available." },
  "notCadre.back":    { zh: "回我的帳號", en: "Back to my account" },
  "down.title":       { zh: "資料庫休眠中", en: "Database is asleep" },
  "down.lede":        { zh: "現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。",
                        en: "We cannot reach the database right now. Email beyondtaiwan2020@gmail.com to have it woken up." },
};

export const MINE = {
  // 進不去
  "noAccess.title":   { zh: "這一組要被派進護照的工作區才用得到", en: "This section needs a passport workspace assignment" },
  "noAccess.lede":    { zh: "兩本護照的格子由被派進那個工作區的幹部、Co-President 與 Senior Adviser 改。你沒有被派進去，所以這一頁對你是關著的；要進來請找 Co-President 到後台的工作區把你加進去。", en: "Passport boxes are edited by cadres assigned to that workspace, Co-Presidents and Senior Advisers. You are not assigned, so this page is closed to you; ask a Co-President to add you under Workspaces in the admin." },
  "noAccess.back":    { zh: "回後台首頁", en: "Back to admin home" },
  // 實習護照的分類
  "cat.onboard":      { zh: "入門", en: "Onboarding" },
  "cat.onboard.hint": { zh: "第一個月要做完的", en: "Done in the first month" },
  "cat.project":      { zh: "任務", en: "Project" },
  "cat.project.hint": { zh: "實際交出去的東西", en: "Work actually handed in" },
  "cat.reflect":      { zh: "反思", en: "Reflection" },
  "cat.reflect.hint": { zh: "寫給自己的，只有本人看得到心得", en: "Written for yourself; only you can read the notes" },
  "cat.unknown":      { zh: "認不得的分類", en: "Unknown category" },
  // 實習護照主畫面
  "it.current":       { zh: "目前這一屆", en: "Current term" },
  "it.viewing":       { zh: "正在看", en: "Viewing" },
  "it.meta":          { zh: "{en}・{from} 到 {to}・{n} 格在用", en: "{en}・{from} to {to}・{n} {n:box|boxes} in use" },
  "it.see":           { zh: "看這一屆的格子", en: "View this term's boxes" },
  "it.edit":          { zh: "改標題或日期", en: "Edit title or dates" },
  "it.activate":      { zh: "設成目前這一屆", en: "Set as current term" },
  "it.title":         { zh: "實習護照", en: "Intern passport" },
  "it.lede":          { zh: "這一屆的格子、開新的一屆。改完 intern 重新整理護照就看得到。目前 {n} 位 intern。", en: "This term's boxes and new terms. Interns see changes when they refresh their passport. {n} {n:intern|interns} now." },
  "it.terms":         { zh: "屆別", en: "Terms" },
  "it.empty":         { zh: "還沒有任何一屆", en: "No terms yet" },
  "it.emptyHint":     { zh: "先開一屆，才能建格子。", en: "Create a term first, then boxes." },
  "it.new":           { zh: "開新的一屆", en: "New term" },
  "ik.preview":       { zh: "看它在實習護照上長什麼樣", en: "See it in the intern passport" },
  "ik.off":           { zh: "停用中", en: "Disabled" },
  "ik.stamped":       { zh: "{n} 人蓋過", en: "{n} stamped" },
  "ik.noStamps":      { zh: "還沒有人蓋", en: "No stamps yet" },
  "ik.seq":           { zh: "順序 {n}", en: "order {n}" },
  "ik.disable":       { zh: "停用", en: "Disable" },
  "ik.enable":        { zh: "恢復", en: "Enable" },
  "ik.new":           { zh: "加一格", en: "Add a box" },
  "ik.section":       { zh: "格子", en: "Boxes" },
  "ik.sectionOf":     { zh: "格子：{t}", en: "Boxes: {t}" },
  "ik.note":          { zh: "intern 的章與心得這裡碰不到。蓋過的格子只能停用不能刪：刪了他的章會跟著不見。\n        要看誰蓋了什麼，到<a href=\"../../intern-passport/\">實習生進度牆</a>。",
                        en: "Interns' stamps and notes cannot be touched here. A stamped box can only be disabled, not deleted, or the stamp would go with it. To see who stamped what, go to the <a href=\"../../intern-passport/\">intern progress wall</a>." },
  "ik.empty":         { zh: "這一屆還沒有格子", en: "No boxes in this term yet" },
  "ik.emptyHint":     { zh: "加第一格，代號系統會先想好。", en: "Add the first box. The id is suggested for you." },
  "ik.needTerm":      { zh: "先開一屆", en: "Create a term first" },
  "ik.needTermHint":  { zh: "有了屆別才能建格子。", en: "Boxes need a term." },
  // 改或開一屆
  "it.editTitle":     { zh: "改這一屆", en: "Edit term" },
  "it.newTitle":      { zh: "開新的一屆", en: "New term" },
  "it.back":          { zh: "回實習護照", en: "Back to intern passport" },
  "it.id":            { zh: "代號（英文字母、數字、連字號；建了就不能改）", en: "Id (letters, digits, hyphens; cannot change once created)" },
  "it.zh":            { zh: "中文名稱", en: "Chinese name" },
  "it.en":            { zh: "英文名稱（會印在護照上，建議全大寫）", en: "English name (printed in the passport, upper case recommended)" },
  "it.start":         { zh: "開始日", en: "Start date" },
  "it.end":           { zh: "結束日", en: "End date" },
  "it.note":          { zh: "開了之後還不會變成「目前這一屆」，回上一頁按「設成目前這一屆」才會。", en: "Creating it does not make it the current term. Go back and press \"Set as current term\"." },
  // 改或加一格（實習）
  "ik.editTitle":     { zh: "改這一格", en: "Edit box" },
  "ik.newTitle":      { zh: "加一格", en: "Add a box" },
  "ik.termLede":      { zh: "屆別：{t}", en: "Term: {t}" },
  "ik.id":            { zh: "代號（建了就不能改，章靠它對到格子）", en: "Id (cannot change once created; stamps match boxes by it)" },
  "ik.cat":           { zh: "分類", en: "Category" },
  "ik.zh":            { zh: "中文標題", en: "Chinese title" },
  "ik.en":            { zh: "英文標題（會印在章上，全大寫、不要太長）", en: "English title (printed on the stamp, upper case, keep it short)" },
  "ik.seqLabel":      { zh: "順序（小的在前）", en: "Order (smaller first)" },
  "ik.desc":          { zh: "說明（格子正面那一行小字）", en: "Description (the small line on the front of the box)" },
  "ik.descPh":        { zh: "做完什麼算完成", en: "What counts as done" },
  // 幹部護照的分類與月份
  "act.gather":       { zh: "聚會", en: "Gathering" },
  "act.gather.hint":  { zh: "全體一起做的事，通常要有人主持", en: "Something everyone does together, usually needs a host" },
  "act.prompt":       { zh: "題目", en: "Prompt" },
  "act.prompt.hint":  { zh: "寫給自己的一題，只有本人看得到", en: "A question for yourself; only you can see it" },
  "act.frame":        { zh: "鏡頭", en: "Frame" },
  "act.frame.hint":   { zh: "一張照片", en: "A photo" },
  "month.1":          { zh: "1 月", en: "January" },
  "month.2":          { zh: "2 月", en: "February" },
  "month.3":          { zh: "3 月", en: "March" },
  "month.4":          { zh: "4 月", en: "April" },
  "month.5":          { zh: "5 月", en: "May" },
  "month.6":          { zh: "6 月", en: "June" },
  "month.7":          { zh: "7 月", en: "July" },
  "month.8":          { zh: "8 月", en: "August" },
  "month.9":          { zh: "9 月", en: "September" },
  "month.10":         { zh: "10 月", en: "October" },
  "month.11":         { zh: "11 月", en: "November" },
  "month.12":         { zh: "12 月", en: "December" },
  // 預覽框
  "pv.reload":        { zh: "重新整理預覽", en: "Reload preview" },
  "pv.open":          { zh: "另開視窗", en: "Open in new window" },
  "pv.close":         { zh: "關掉", en: "Close" },
  "pv.frameTitle":    { zh: "護照預覽", en: "Passport preview" },
  "pv.title":         { zh: "護照預覽：{m}", en: "Passport preview: {m}" },
  "pv.hint":          { zh: "這是你自己那本，剛改的格子重新整理預覽就會出現", en: "This is your own passport. Reload the preview to see the box you just changed." },
  "ipv.title":        { zh: "實習護照預覽", en: "Intern passport preview" },
  "ipv.titleCat":     { zh: "實習護照預覽：{c}", en: "Intern passport preview: {c}" },
  "ipv.notActive":    { zh: "樣書只畫目前這一屆的格子，你現在在看的不是那一屆。", en: "The sample only shows the current term's boxes, and you are viewing a different term." },
  "ipv.hint":         { zh: "這是樣書：目前這一屆的格子、假的持照人、沒有章。intern 看到的就是這個樣子。", en: "This is the sample: the current term's boxes, a made-up holder, no stamps. This is what interns see." },
  // 幹部護照主畫面
  "ak.needsHost":     { zh: "要主持人", en: "Needs a host" },
  "ak.callback":      { zh: "回望 {id}", en: "Looks back at {id}" },
  "pa.title":         { zh: "幹部護照", en: "Cadre passport" },
  "pa.lede":          { zh: "33 格的題目與說明、每個月右上角的時刻、入境章抽得到的城市。改完幹部重新整理護照就看得到。", en: "The 33 boxes' titles and descriptions, each month's time in the corner, and the cities the entry stamp can draw. Cadres see changes when they refresh their passport." },
  "pa.note":          { zh: "幹部的章、心得、照片這裡碰不到。<b>編號不能改</b>（章靠它對到格子），蓋過的格子只能停用不能刪，城市只能停用不能刪。", en: "Cadres' stamps, notes and photos cannot be touched here. <b>Ids cannot change</b> (stamps match boxes by them). Stamped boxes and cities can only be disabled, not deleted." },
  "pa.noMonths":      { zh: "月份載不到的話，格子也不會出現。", en: "If the months do not load, the boxes will not show either." },
  "pa.emptyMonth":    { zh: "這個月還沒有格子。", en: "No boxes this month yet." },
  "pa.addIn":         { zh: "在 {m}加一格", en: "Add a box in {m}" },
  "pa.theme":         { zh: "右上角的時刻：{t}", en: "Time in the corner: {t}" },
  "pa.themeEmpty":    { zh: "（空）", en: "(empty)" },
  "pa.editTheme":     { zh: "改時刻", en: "Edit time" },
  "pa.preview":       { zh: "看它在護照上長什麼樣", en: "See it in the passport" },
  "pa.jump":          { zh: "跳到某一個月", en: "Jump to a month" },
  "pa.monthsGone":    { zh: "月份還沒載到", en: "Months not loaded" },
  "pa.monthsGoneHint":{ zh: "重新整理再試一次。", en: "Refresh and try again." },
  // 城市
  "ct.drawable":      { zh: "抽得到", en: "Can be drawn" },
  "ct.rename":        { zh: "改名字", en: "Rename" },
  "ct.title":         { zh: "城市", en: "Cities" },
  "ct.lede":          { zh: "入境章抽城市用的。{n} 個城市，{a} 個抽得到。", en: "Cities the entry stamp draws from. {n} {n:city|cities}, {a} can be drawn." },
  "ct.new":           { zh: "加一個城市", en: "Add a city" },
  "ct.note":          { zh: "有人抽到過的城市資料庫擋著不給刪，所以這裡只有停用。停用之後新的入境章不會再抽到它，已經發出去的不動。", en: "The database will not delete a city someone has drawn, so there is only disable. A disabled city is not drawn for new entry stamps. Existing stamps stay." },
  "ct.city":          { zh: "城市", en: "City" },
  "ct.code":          { zh: "代碼", en: "Code" },
  "ct.status":        { zh: "狀態", en: "Status" },
  "ct.empty":         { zh: "還沒有城市", en: "No cities yet" },
  "ct.emptyHint":     { zh: "加第一個，入境章才抽得到東西。", en: "Add the first one so the entry stamp has something to draw." },
  // 改或加一格（幹部）
  "ak.editTitle":     { zh: "改這一格", en: "Edit box" },
  "ak.newTitle":      { zh: "加一格", en: "Add a box" },
  "ak.idLocked":      { zh: "編號 <b>{id}</b>（不能改，章靠它對到格子）", en: "Id <b>{id}</b> (cannot change; stamps match boxes by it)" },
  "ak.idAuto":        { zh: "編號由系統照月份算，存了之後就不能改。", en: "The id is assigned by month and cannot change after saving." },
  "ak.back":          { zh: "回幹部護照", en: "Back to cadre passport" },
  "ak.month":         { zh: "月份", en: "Month" },
  "ak.monthLocked":   { zh: "（建了就不能換）", en: " (cannot change once created)" },
  "ak.host":          { zh: "這一格要有人主持（聚會通常要）", en: "This box needs a host (gatherings usually do)" },
  "ak.cb":            { zh: "回望哪一格（選填，例如 09B；打開這一格時會把那一格的心得拉回來）", en: "Looks back at which box (optional, for example 09B; opening this box pulls in that box's notes)" },
  "ak.descPh":        { zh: "做什麼算完成", en: "What counts as done" },
  // 時刻
  "mk.title":         { zh: "{m}的時刻", en: "Time for {m}" },
  "mk.lede":          { zh: "月份頁右上角那一小串字。留空就不顯示。刻意不整點的時刻（08:40、23:50）是內容決定，不是打字錯誤。", en: "The short string in the corner of the month page. Leave blank to hide it. Odd times like 08:40 and 23:50 are deliberate content, not typos." },
  "mk.zh":            { zh: "時刻", en: "Time" },
  "mk.en":            { zh: "英文副標（現在的版面不顯示，留空就好）", en: "English subtitle (not shown in the current layout, leave blank)" },
  // 城市的名字
  "dk.editTitle":     { zh: "改這個城市的名字", en: "Rename city" },
  "dk.newTitle":      { zh: "加一個城市", en: "Add a city" },
  "dk.lede":          { zh: "入境章會印這個名字，建議全大寫英文。", en: "The entry stamp prints this name. Upper case English recommended." },
  "dk.back":          { zh: "回城市", en: "Back to cities" },
  "dk.code":          { zh: "代碼（2 到 8 個英文或數字，建議用機場代碼{locked}）", en: "Code (2 to 8 letters or digits, airport codes recommended{locked})" },
  "dk.codeLocked":    { zh: "；建了就不能改", en: "; cannot change once created" },
  "dk.city":          { zh: "城市名字", en: "City name" },
  // main.js 的訊息與確認
  "err.internLoad":   { zh: "實習護照載不到：", en: "Could not load the intern passport: " },
  "err.cadreLoad":    { zh: "幹部護照載不到：", en: "Could not load the cadre passport: " },
  "err.citiesLoad":   { zh: "城市載不到：", en: "Could not load cities: " },
  "err.noTask":       { zh: "找不到這一格，重新整理再試一次。", en: "Box not found. Refresh and try again." },
  "err.noMonth":      { zh: "找不到這個月份，重新整理再試一次。", en: "Month not found. Refresh and try again." },
  "err.noCity":       { zh: "找不到這個城市，重新整理再試一次。", en: "City not found. Refresh and try again." },
  "err.titles":       { zh: "中文標題與英文標題都要填。", en: "Fill in both the Chinese and English titles." },
  "err.cityBoth":     { zh: "代碼與城市名字都要填。", en: "Fill in both the code and the city name." },
  "err.termFive":     { zh: "五格都要填：代號、中文名稱、英文名稱、開始日、結束日。", en: "Fill in all five: id, Chinese name, English name, start date, end date." },
  "err.taskThree":    { zh: "代號、中文標題、英文標題都要填。", en: "Fill in the id, the Chinese title and the English title." },
  "err.enable":       { zh: "恢復不了：", en: "Could not enable: " },
  "err.disable":      { zh: "停用不了：", en: "Could not disable: " },
  "err.activate":     { zh: "設不了：", en: "Could not set: " },
  "msg.actEdited":    { zh: "「{t}」改好了。幹部重新整理護照就看得到。", en: "\"{t}\" updated. Cadres see it when they refresh their passport." },
  "msg.actAdded":     { zh: "「{t}」加好了，編號是 {id}。幹部重新整理護照就看得到。", en: "\"{t}\" added with id {id}. Cadres see it when they refresh their passport." },
  "msg.enabled":      { zh: "「{t}」恢復了。", en: "\"{t}\" enabled." },
  "msg.disabled":     { zh: "「{t}」停用了。", en: "\"{t}\" disabled." },
  "msg.deletedT":     { zh: "「{t}」刪掉了。", en: "\"{t}\" deleted." },
  "msg.themeSaved":   { zh: "{m}的時刻改好了。", en: "Time for {m} updated." },
  "msg.cityEdited":   { zh: "「{c}」改好了。", en: "\"{c}\" updated." },
  "msg.cityAdded":    { zh: "「{c}」加好了，代碼是 {code}。", en: "\"{c}\" added with code {code}." },
  "msg.viewing":      { zh: "現在看的是 {id}。", en: "Now viewing {id}." },
  "msg.termEdited":   { zh: "「{t}」改好了。", en: "\"{t}\" updated." },
  "msg.termAdded":    { zh: "「{t}」開好了。還不是目前這一屆，要的話按「設成目前這一屆」。", en: "\"{t}\" created. It is not the current term yet. Press \"Set as current term\" if you want that." },
  "msg.activated":    { zh: "「{t}」現在是目前這一屆了。", en: "\"{t}\" is now the current term." },
  "msg.taskEdited":   { zh: "「{t}」改好了。intern 重新整理護照就看得到。", en: "\"{t}\" updated. Interns see it when they refresh their passport." },
  "msg.taskAdded":    { zh: "「{t}」加好了。intern 重新整理護照就看得到。", en: "\"{t}\" added. Interns see it when they refresh their passport." },
  "confirm.actOff":   { zh: "停用「{t}」？\n\n停用之後護照上就看不到這一格，已經蓋過的章還在，之後可以恢復。", en: "Disable \"{t}\"?\n\nThe box disappears from the passport. Existing stamps stay. You can enable it again later." },
  "confirm.actDel":   { zh: "刪掉「{t}」？\n\n還沒有人蓋過，所以可以刪。刪了就回不來。", en: "Delete \"{t}\"?\n\nNobody has stamped it, so it can be deleted. This cannot be undone." },
  "confirm.cityOff":  { zh: "停用「{c}」？\n\n之後新的入境章不會再抽到它，已經發出去的不動。可以恢復。", en: "Disable \"{c}\"?\n\nNew entry stamps will not draw it. Existing stamps stay. You can enable it again." },
  "confirm.activate": { zh: "把「{t}」設成目前這一屆？\n\n之後新進來的 intern 會拿到這一屆的護照，/intern-passport/ 顯示的也是這一屆的格子。", en: "Set \"{t}\" as the current term?\n\nNew interns get this term's passport and /intern-passport/ shows this term's boxes." },
  "confirm.taskOff":  { zh: "停用「{t}」？\n\n停用之後 intern 的護照上就看不到這一格，已經蓋過的章還在，之後可以恢復。", en: "Disable \"{t}\"?\n\nThe box disappears from interns' passports. Existing stamps stay. You can enable it again later." },
  // 蛇梯棋的棋盤（2026-10-22）
  "bd.title":         { zh: "棋盤", en: "Board" },
  "bd.lede":          { zh: "{t} 的蛇梯棋。intern 蓋一個章拿一張票，擲骰子走棋。點一格就能改它是什麼。", en: "Snakes and ladders for {t}. Interns earn one roll per stamp. Click a square to change what it is." },
  "bd.noTerm":        { zh: "還沒開這一屆", en: "No term yet" },
  "bd.noTermHint":    { zh: "先到「實習護照」開一屆，才有棋盤可以排。", en: "Open a term under Intern passport first; then there is a board to lay out." },
  "bd.save":          { zh: "存起來", en: "Save" },
  "bd.saving":        { zh: "存檔中…", en: "Saving…" },
  "bd.preview":       { zh: "看它在實習護照上長什麼樣", en: "See it in the intern passport" },
  "bd.setup":         { zh: "這一屆的棋盤", en: "This term's board" },
  "bd.size":          { zh: "幾格", en: "Squares" },
  "bd.on":            { zh: "開著：intern 看得到棋盤、擲得了骰子。格數與蛇梯鎖住，只能改空格與任務格。", en: "On: interns see the board and can roll. Size, snakes and ladders are locked; only plain and task squares can change." },
  "bd.off":           { zh: "還沒開：intern 看到的還是原本的護照。排好再開。", en: "Off: interns still see the plain passport. Lay it out, then turn it on." },
  "bd.turnOn":        { zh: "打開棋盤", en: "Turn the board on" },
  "bd.turnOff":       { zh: "關掉棋盤", en: "Turn the board off" },
  "bd.unsaved":       { zh: "有還沒存的改動", en: "Unsaved changes" },
  "bd.layout":        { zh: "排棋盤", en: "Lay out the board" },
  "bd.layoutHint":    { zh: "{l} 道梯、{s} 條蛇、{k} 個任務格", en: "{l} {l:ladder|ladders}, {s} {s:snake|snakes}, {k} task {k:square|squares}" },
  "bd.pick":          { zh: "第 {n} 格", en: "Square {n}" },
  "bd.kind":          { zh: "這一格是", en: "This square is" },
  "bd.kind.plain":    { zh: "空格", en: "Plain" },
  "bd.kind.task":     { zh: "任務格", en: "Task" },
  "bd.kind.ladder":   { zh: "梯子底（往上）", en: "Ladder (goes up)" },
  "bd.kind.snake":    { zh: "蛇頭（往下）", en: "Snake (goes down)" },
  "bd.task":          { zh: "綁哪一個格子", en: "Which box" },
  "bd.goes":          { zh: "通到第幾格", en: "Goes to square" },
  "bd.apply":         { zh: "套用", en: "Apply" },
  "bd.clear":         { zh: "清成空格", en: "Make plain" },
  "bd.pickHint":      { zh: "點上面任何一格來改它。", en: "Click any square above to edit it." },
  "bd.start":         { zh: "起點", en: "Start" },
  "bd.finish":        { zh: "終點", en: "Finish" },
  "bd.finishHint":    { zh: "最後一格建議綁「期末成果」：沒蓋那一格的人會停在倒數第二格等。", en: "Bind the last square to the final deliverable: anyone who has not stamped it waits one square short." },
  "bd.rules":         { zh: "規則：蓋一個章一張票，一張票擲一次。落在梯子底往上、蛇頭往下。落在還沒做的任務格，做完多送一張票。蛇只讓人後退，不減票。", en: "Rules: one stamp earns one roll. Land on a ladder to climb, on a snake to slide. Land on an unstamped task square and finish it for a bonus roll. Snakes only move you back; they never take rolls." },
  "msg.boardSaved":   { zh: "棋盤存好了。", en: "Board saved." },
  "msg.boardOn":      { zh: "棋盤開了。intern 重新整理就看得到。", en: "Board is on. Interns see it when they refresh." },
  "msg.boardOff":     { zh: "棋盤關了。", en: "Board is off." },
  "err.boardLoad":    { zh: "棋盤載不到：", en: "Could not load the board: " },
  "err.boardSave":    { zh: "棋盤存不起來：", en: "Could not save the board: " },
  "err.boardToggle":  { zh: "開關不了：", en: "Could not switch: " },
  "err.boardUnsaved": { zh: "先把棋盤存起來，再開。", en: "Save the board first, then turn it on." },
  "err.ladderUp":     { zh: "梯子要往上：通到的格子要比這一格大。", en: "A ladder must go up: the target must be a higher square." },
  "err.snakeDown":    { zh: "蛇要往下：通到的格子要比這一格小。", en: "A snake must go down: the target must be a lower square." },
  "err.goesRange":    { zh: "通到的格子要在 1 到 {n} 之間。", en: "The target must be between 1 and {n}." },
  "err.needTask":     { zh: "任務格要選一個格子。", en: "A task square needs a box." },
  "confirm.boardOn":  { zh: "打開棋盤？\n\n打開之後 intern 就看得到棋盤、擲得了骰子。格數與蛇梯會鎖住，只能改空格與任務格。", en: "Turn the board on?\n\nInterns will see the board and can roll. Size, snakes and ladders lock; only plain and task squares can change." },
  "confirm.boardOff": { zh: "關掉棋盤？\n\nintern 看到的會變回原本的護照。已經擲過的紀錄都還在，再打開就回來。", en: "Turn the board off?\n\nInterns go back to the plain passport. Rolls are kept and come back when you turn it on again." },
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
