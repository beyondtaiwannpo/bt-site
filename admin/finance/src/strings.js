// 後台「財務」那一組的字典（2026-11-08）：畫面上每一句中文與英文並排（2026-10-19，後台中英切換）。
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
  "ws.long.finance":  { zh: "財務（帳戶、收支、預算）", en: "Finance (accounts, transactions, budget)" },
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
  "noAccess.title":   { zh: "財務只有 Co-President、Senior Adviser 與 Sponsorship 的 Director 看得到", en: "Finance is for Co-Presidents, Senior Advisers and the Sponsorship Director" },
  "noAccess.lede":    { zh: "錢的事只開給這三種人。你是 Sponsorship 的 Director 卻進不來，請 Co-President 到人與權限確認這一屆的職位有填「Director, Sponsorship Team」。", en: "Money is limited to these three roles. If you are the Sponsorship Director and still cannot get in, ask a Co-President to check that this term's position reads \"Director, Sponsorship Team\" under People." },
  "noAccess.back":    { zh: "回後台首頁", en: "Back to admin home" },
  "readonly":         { zh: "你只能看，改不動。改得動的是 Co-President 與 Sponsorship 的 Director。", en: "You can view but not edit. Co-Presidents and the Sponsorship Director can edit." },
  // 種類與帳戶種類
  "kind.income":      { zh: "收入", en: "Income" },
  "kind.expense":     { zh: "支出", en: "Expense" },
  "kind.transfer":    { zh: "轉帳", en: "Transfer" },
  "acc.kind.bank":    { zh: "銀行", en: "Bank" },
  "acc.kind.cash":    { zh: "現金", en: "Cash" },
  "acc.kind.platform":{ zh: "平台", en: "Platform" },
  // 欄位
  "f.date":           { zh: "日期", en: "Date" },
  "f.kind":           { zh: "種類", en: "Kind" },
  "f.amount":         { zh: "金額", en: "Amount" },
  "f.currency":       { zh: "幣別", en: "Currency" },
  "f.rate":           { zh: "匯率", en: "Rate" },
  "f.rateHint":       { zh: "1 美金換幾塊台幣，照入帳那天銀行給的數字", en: "TWD per 1 USD, as the bank credited it" },
  "f.twd":            { zh: "台幣", en: "TWD" },
  "f.account":        { zh: "帳戶", en: "Account" },
  "f.toAccount":      { zh: "轉入帳戶", en: "To account" },
  "f.category":       { zh: "類別", en: "Category" },
  "f.counterparty":   { zh: "對象", en: "Counterparty" },
  "f.counterpartyPh": { zh: "誰給的、付給誰", en: "Who paid, or who was paid" },
  "f.note":           { zh: "備註", en: "Note" },
  "f.receipt":        { zh: "收據", en: "Receipt" },
  "f.voided":         { zh: "作廢", en: "Voided" },
  "f.voidReason":     { zh: "作廢原因", en: "Void reason" },
  "f.enteredBy":      { zh: "誰登的", en: "Entered by" },
  "f.none":           { zh: "（無）", en: "(none)" },
  "f.pickCategory":   { zh: "選一個類別", en: "Pick a category" },
  // 總覽
  "ov.title":         { zh: "財務總覽", en: "Finance overview" },
  "ov.lede":          { zh: "現在有多少錢、這一屆進來多少出去多少。數字從每個帳戶開帳那天起算，作廢的不算，轉帳只是搬家不算收入也不算支出。", en: "How much there is now, and what came in and went out this term. Figures start from each account's opening day; voided rows are excluded; transfers just move money and count as neither income nor expense." },
  "ov.total":         { zh: "現在全部的錢", en: "Total money now" },
  "ov.totalHint":     { zh: "每個沒封存的帳戶加起來", en: "All active accounts added up" },
  "ov.accounts":      { zh: "每個帳戶", en: "Per account" },
  "ov.termIncome":    { zh: "這一屆收入", en: "Income this term" },
  "ov.termExpense":   { zh: "這一屆支出", en: "Expenses this term" },
  "ov.monthIncome":   { zh: "這個月收入", en: "Income this month" },
  "ov.monthExpense":  { zh: "這個月支出", en: "Expenses this month" },
  "ov.net":           { zh: "這一屆淨額", en: "Net this term" },
  "ov.byExpense":     { zh: "支出照類別", en: "Expenses by category" },
  "ov.byIncome":      { zh: "收入照類別", en: "Income by category" },
  "ov.months":        { zh: "每月收入與支出", en: "Income vs expenses by month" },
  "ov.budget":        { zh: "預算與花掉的", en: "Budget vs spent" },
  "ov.uncat":         { zh: "有 {n} 筆沒選類別，照類別那幾張圖少算了它們。到收支那一頁補上。", en: "{n} {n:row has|rows have} no category and {n:is|are} missing from the category charts. Fill them in under Transactions." },
  "ov.noAccounts":    { zh: "還沒有帳戶", en: "No accounts yet" },
  "ov.noAccountsHint":{ zh: "第一天先到「帳戶與類別」把每個帳戶今天的餘額填成開帳餘額。之前的錢不補登。", en: "On day one, go to Accounts & categories and enter each account's balance today as its opening balance. Earlier money is not back-filled." },
  "ov.goAccounts":    { zh: "去加帳戶", en: "Add accounts" },
  "ov.term":          { zh: "看哪一屆", en: "Term" },
  "ov.in":            { zh: "收入", en: "Income" },
  "ov.out":           { zh: "支出", en: "Expenses" },
  "ov.noNumbers":     { zh: "這一屆還沒有任何一筆", en: "Nothing recorded this term yet" },
  // 收支
  "tx.title":         { zh: "收支", en: "Transactions" },
  "tx.lede":          { zh: "每一筆進來或出去的錢。新的一筆按「加進去」；已經在清單上的改了就存；登錯的不刪，按「作廢」寫一句為什麼，紀錄留著。", en: "Every row of money in or out. New rows need the Add button; rows already on the list save as you change them; wrong rows are not deleted, void them with a reason and the record stays." },
  "tx.new":           { zh: "加一筆", en: "Add a row" },
  "tx.add":           { zh: "加進去", en: "Add" },
  "tx.cancel":        { zh: "不加了", en: "Cancel" },
  "tx.void":          { zh: "作廢", en: "Void" },
  "tx.voidAsk":       { zh: "作廢這一筆？寫一句為什麼（例如「重複登了」），之後清單上會變灰並留著原因。", en: "Void this row? Write why (for example \"duplicate\"); it stays on the list greyed out with the reason." },
  "tx.voidReasonPh":  { zh: "為什麼作廢", en: "Why it is voided" },
  "tx.voidedTag":     { zh: "作廢", en: "Voided" },
  "tx.receiptUp":     { zh: "傳收據", en: "Upload receipt" },
  "tx.receiptView":   { zh: "看收據", en: "View receipt" },
  "tx.receiptGone":   { zh: "拿掉收據", en: "Remove receipt" },
  "tx.receiptHint":   { zh: "圖或 PDF，5 MB 以內。只有看得到財務的人開得了。", en: "Image or PDF up to 5 MB. Only people who can see Finance can open it." },
  "tx.uploading":     { zh: "上傳中…", en: "Uploading…" },
  "tx.filter":        { zh: "篩選", en: "Filter" },
  "tx.q":             { zh: "找對象或備註", en: "Search counterparty or note" },
  "tx.all":           { zh: "全部", en: "All" },
  "tx.allMonths":     { zh: "整屆", en: "Whole term" },
  "tx.allTerms":      { zh: "所有屆", en: "All terms" },
  "tx.none":          { zh: "沒有符合的", en: "Nothing matches" },
  "tx.noneHint":      { zh: "換個篩選，或加一筆。", en: "Change the filter, or add a row." },
  "tx.count":         { zh: "{n} 筆", en: "{n} {n:row|rows}" },
  "tx.sum":           { zh: "收入 {in}・支出 {out}", en: "Income {in} · Expenses {out}" },
  "tx.newTitle":      { zh: "新的一筆", en: "New row" },
  "tx.by":            { zh: "{name} 登的", en: "entered by {name}" },
  "tx.zeczec":        { zh: "嘖嘖撥款：整筆進來當一筆收入，類別選「募資」，帳戶選錢真的進的那個銀行帳戶，對象寫「嘖嘖」。平台手續費另外登一筆支出，類別「手續費」。", en: "zeczec payout: record the whole payout as one income row, category Crowdfunding, account the bank account it landed in, counterparty zeczec. Record the platform fee as a separate expense under Fees." },
  // 帳戶與類別
  "acc.title":        { zh: "帳戶與類別", en: "Accounts & categories" },
  "acc.lede":         { zh: "帳戶是錢放在哪裡（銀行、現金、平台）。第一天把每個帳戶今天的餘額填成開帳餘額、開帳日填今天，之前的錢不補登。類別是收支分哪幾種，改名會連舊的一起改，不用的封存不刪。", en: "Accounts are where money sits (bank, cash, platform). On day one enter each account's balance today as its opening balance with today's date; earlier money is not back-filled. Categories group income and expenses; renaming applies to old rows too, and unused ones are archived, never deleted." },
  "acc.section":      { zh: "帳戶", en: "Accounts" },
  "acc.new":          { zh: "加一個帳戶", en: "Add an account" },
  "acc.add":          { zh: "加進去", en: "Add" },
  "acc.nameZh":       { zh: "中文名", en: "Chinese name" },
  "acc.nameEn":       { zh: "英文名", en: "English name" },
  "acc.kind":         { zh: "種類", en: "Kind" },
  "acc.opening":      { zh: "開帳餘額", en: "Opening balance" },
  "acc.openingOn":    { zh: "開帳日", en: "Opening date" },
  "acc.balance":      { zh: "現在餘額", en: "Balance now" },
  "acc.archive":      { zh: "封存", en: "Archive" },
  "acc.unarchive":    { zh: "恢復", en: "Restore" },
  "acc.archived":     { zh: "封存了", en: "Archived" },
  "acc.archiveAsk":   { zh: "封存這個帳戶？清單上會收起來，舊的收支照留著。", en: "Archive this account? It is hidden from lists; old rows stay." },
  "acc.none":         { zh: "還沒有帳戶", en: "No accounts yet" },
  "acc.noneHint":     { zh: "先加一個，開帳餘額填今天帳戶裡的數字。", en: "Add one; the opening balance is what is in the account today." },
  "cat.section":      { zh: "類別", en: "Categories" },
  "cat.new":          { zh: "加一個類別", en: "Add a category" },
  "cat.income":       { zh: "收入的類別", en: "Income categories" },
  "cat.expense":      { zh: "支出的類別", en: "Expense categories" },
  "cat.archiveAsk":   { zh: "封存這個類別？新的收支選不到它，舊的照留著。", en: "Archive this category? New rows cannot pick it; old rows keep it." },
  // 預算
  "bu.title":         { zh: "預算", en: "Budget" },
  "bu.lede":          { zh: "這一屆每一類支出打算花多少。填了之後總覽會畫「花掉多少」的進度條，超過變橘的。只是提醒，不會擋。", en: "How much each expense category is meant to spend this term. The overview draws a progress bar per category and turns orange when over. It is a reminder, not a block." },
  "bu.amount":        { zh: "這一屆預算（台幣）", en: "Budget this term (TWD)" },
  "bu.spent":         { zh: "花掉", en: "Spent" },
  "bu.none":          { zh: "還沒填預算", en: "No budget set" },
  "bu.noCats":        { zh: "還沒有支出的類別", en: "No expense categories yet" },
  "bu.noCatsHint":    { zh: "先到帳戶與類別加幾個。", en: "Add some under Accounts & categories." },
  // 匯出
  "ex.title":         { zh: "匯出", en: "Export" },
  "ex.lede":          { zh: "把收支下載成 CSV 給會計或理事會。開頭帶 UTF-8 BOM，Excel 直接開中文不會變亂碼。作廢的列也在，最後兩欄標著。", en: "Download transactions as CSV for the accountant or the board. It starts with a UTF-8 BOM so Excel opens Chinese correctly. Voided rows are included and flagged in the last two columns." },
  "ex.scope":         { zh: "匯出哪些", en: "What to export" },
  "ex.n":             { zh: "會匯出 {n} 筆", en: "{n} {n:row|rows} will be exported" },
  "ex.download":      { zh: "下載 CSV", en: "Download CSV" },
  "ex.tip":           { zh: "要更細的篩選（帳戶、類別、文字），先到收支那一頁篩好，再回來這裡下載，篩選會跟著。", en: "For a narrower export (account, category, text), set the filter on Transactions first and come back; the filter carries over." },
  // CSV 的表頭（跟畫面語言走）
  "csv.head":         { zh: "日期,種類,金額,幣別,匯率,台幣,帳戶,轉入帳戶,類別,對象,備註,收據,作廢,作廢原因", en: "Date,Kind,Amount,Currency,Rate,TWD,Account,To account,Category,Counterparty,Note,Receipt,Voided,Void reason" },
  // 圖
  "chart.aria":       { zh: "每月收入與支出", en: "Income and expenses by month" },
  "chart.month":      { zh: "{m}月", en: "{mon}" },
  "chart.title":      { zh: "{ym}：收入 {in}、支出 {out}", en: "{ym}: income {in}, expenses {out}" },
  // 做成了
  "msg.txAdded":      { zh: "加進去了：{what}。", en: "Added: {what}." },
  "msg.txSaved":      { zh: "這一筆存好了。", en: "Row saved." },
  "msg.txVoided":     { zh: "作廢了。", en: "Voided." },
  "msg.accSaved":     { zh: "帳戶存好了。", en: "Account saved." },
  "msg.accAdded":     { zh: "帳戶「{name}」加進去了。", en: "Account \"{name}\" added." },
  "msg.accArchived":  { zh: "帳戶「{name}」封存了。", en: "Account \"{name}\" archived." },
  "msg.accRestored":  { zh: "帳戶「{name}」恢復了。", en: "Account \"{name}\" restored." },
  "msg.catSaved":     { zh: "類別存好了。", en: "Category saved." },
  "msg.catAdded":     { zh: "類別「{name}」加進去了。", en: "Category \"{name}\" added." },
  "msg.catArchived":  { zh: "類別「{name}」封存了。", en: "Category \"{name}\" archived." },
  "msg.catRestored":  { zh: "類別「{name}」恢復了。", en: "Category \"{name}\" restored." },
  "msg.budgetSaved":  { zh: "預算存好了。", en: "Budget saved." },
  "msg.receiptUp":    { zh: "收據傳好了。", en: "Receipt uploaded." },
  "msg.receiptGone":  { zh: "收據拿掉了。", en: "Receipt removed." },
  "msg.csv":          { zh: "下載了 {n} 筆。", en: "Downloaded {n} {n:row|rows}." },
  // 沒做成
  "err.load":         { zh: "財務載不到：", en: "Could not load finance: " },
  "err.add":          { zh: "加不進去：", en: "Could not add: " },
  "err.void":         { zh: "作廢不了：", en: "Could not void: " },
  "err.upload":       { zh: "收據傳不上去：", en: "Could not upload the receipt: " },
  "err.receipt":      { zh: "收據開不了：", en: "Could not open the receipt: " },
  "err.needDate":     { zh: "要填日期。", en: "A date is required." },
  "err.needAmount":   { zh: "金額要大於 0。", en: "Amount must be greater than 0." },
  "err.needRate":     { zh: "不是台幣就要填匯率。", en: "A rate is required for non-TWD rows." },
  "err.needAccount":  { zh: "要選帳戶。", en: "Pick an account." },
  "err.needTo":       { zh: "轉帳要選轉入的帳戶，而且不能跟轉出的是同一個。", en: "A transfer needs a different destination account." },
  "err.needCategory": { zh: "收入與支出要選類別。", en: "Income and expenses need a category." },
  "err.needName":     { zh: "中文名或英文名至少填一個。", en: "Fill in at least one name." },
  "err.needReason":   { zh: "作廢要寫原因。", en: "A void reason is required." },
  "err.badFile":      { zh: "收據只收圖（jpg、png、webp）或 PDF。", en: "Receipts must be an image (jpg, png, webp) or a PDF." },
  "err.bigFile":      { zh: "收據要在 5 MB 以內。", en: "Receipts must be 5 MB or smaller." },
  // 資料庫回的代碼翻成人話（data.js 的 says）
  "says.notViewer":   { zh: "只有 Co-President、Senior Adviser 與 Sponsorship 的 Director 看得到財務。", en: "Only Co-Presidents, Senior Advisers and the Sponsorship Director can see Finance." },
  "says.notEditor":   { zh: "只有 Co-President 與 Sponsorship 的 Director 改得動財務。", en: "Only Co-Presidents and the Sponsorship Director can edit Finance." },
  "says.voided":      { zh: "這一筆已經作廢了，不能再改。要修正就重新加一筆。", en: "This row is voided and cannot be edited. Add a new row instead." },
  "says.needRate":    { zh: "不是台幣就要填匯率。", en: "A rate is required for non-TWD rows." },
  "says.twoAccounts": { zh: "轉帳要有轉出與轉入兩個帳戶。", en: "A transfer needs both a source and a destination account." },
  "says.sameAccount": { zh: "轉出與轉入不能是同一個帳戶。", en: "Source and destination cannot be the same account." },
  "says.badAmount":   { zh: "金額要大於 0。", en: "Amount must be greater than 0." },
  "says.badKind":     { zh: "種類只能是收入、支出或轉帳。", en: "Kind must be income, expense or transfer." },
  "says.noAccount":   { zh: "找不到那個帳戶（可能封存了）。", en: "Account not found (maybe archived)." },
  "says.noCategory":  { zh: "找不到那個類別，或種類對不上（收入選了支出的類別）。", en: "Category not found, or its kind does not match the row." },
  "says.noTx":        { zh: "找不到這一筆，重新整理再試。", en: "Row not found. Refresh and try again." },
  "says.needCategory":{ zh: "收入與支出要選類別。", en: "Income and expenses need a category." },
  "says.badDate":     { zh: "日期的格式不對。", en: "That is not a valid date." },
  "says.noTerm":      { zh: "找不到那一屆。", en: "Term not found." },
  "says.needReason":  { zh: "作廢要寫原因。", en: "A void reason is required." },
  "says.needName":    { zh: "中文名或英文名至少填一個。", en: "Fill in at least one name." },
  "says.noBucket":    { zh: "Storage 的 receipts bucket 還不在，要先跑 2026-11-08-finance.sql（或到 Supabase 的 Storage 手動建一個叫 receipts 的私人 bucket）。", en: "The receipts storage bucket does not exist yet. Run 2026-11-08-finance.sql first (or create a private bucket named receipts in Supabase Storage)." },
  "says.noFinance":   { zh: "財務的資料表還不在，要先在 Supabase 跑 2026-11-08-finance.sql。", en: "The finance tables are not there yet. Run 2026-11-08-finance.sql in Supabase first." },
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
