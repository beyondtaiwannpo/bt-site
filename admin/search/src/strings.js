// 後台「搜尋」的字典（2026-11-26）：畫面上每一句中文與英文並排（2026-10-19，後台中英切換）。
// 做法與理由見 docs/2026-10-19-後台中英切換.md，怎麼加一句見 README「後台的中英切換」。
//
// **每一個後台資料夾各有一支 strings.js**，不互相 import（跟 esc()、側欄那一段同一條規矩）。
// COMMON 那一段每一份一模一樣（test/admin-hub.test.mjs 逐字比對），MINE 是這一組自己的畫面。
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
  "why.finance":      { zh: "只有 Co-President、Senior Adviser、Sponsorship 的 Director 與被派進「錢」的人進得去", en: "Co-Presidents, Senior Advisers, the Sponsorship Director and people assigned to Money only" },
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
  "ws.long.res":      { zh: "活動、會議、資源", en: "Events, meetings, resources" },
  "ws.long.finance":  { zh: "財務（帳戶、收支、預算）", en: "Finance (accounts, transactions, budget)" },
  "ws.long.money":    { zh: "錢（記收支、預算）", en: "Money (record income and spending, budget)" },
  "ws.long.records":  { zh: "BT Records（人、活動、回饋、去向）", en: "BT Records (people, events, feedback, outcomes)" },
  "ws.board":         { zh: "整個 BT", en: "Whole BT" },
  "ws.playNote":      { zh: "玩護照是身分帶來的（每位幹部有自己的、每位實習生有自己的），這幾格只管誰能改格子。", en: "Playing a passport comes with the role (every cadre has theirs, every intern theirs); these cells only control who edits the boxes." },
  "ws.availNote":     { zh: "時間看板沒有指派，每位幹部都用。", en: "Availability has no assignments: every cadre uses it." },
  "ws.levelLegend":   { zh: "看：讀得到，什麼都改不了。改：在那裡新增、修改，大部分的人要的是這一級。管：改，再加上在那裡加人、改等級、移出，通常是 Director。三級在每一個地方意思都一樣。", en: "View: sees it, cannot change anything. Edit: creates and changes things there; most people need this. Manage: Edit, plus adds, re-levels and removes people there; usually the Director. The three levels mean the same thing everywhere." },
  // 成員分頁（2026-10-23，第三次重整批 3）：對一個工作區是「管」的人，在那個東西自己的頁面上加人、改等級、移出。
  "level.view":       { zh: "看", en: "View" },
  "level.edit":       { zh: "改", en: "Edit" },
  "level.manage":     { zh: "管", en: "Manage" },
  "mp.open":          { zh: "誰在做{name}", en: "Who works on {name}" },
  "mp.title":         { zh: "{name}的成員", en: "People on {name}" },
  "mp.lede":          { zh: "被派進這個工作區的人。你對它是「管」，所以可以加人、改等級、移出。每一筆都記在變動紀錄裡。", en: "People assigned to this workspace. You have Manage on it, so you can add people, change levels and remove them. Every change is written to the change log." },
  "mp.back":          { zh: "回上一頁", en: "Back" },
  "mp.levels":        { zh: "看：讀得到，什麼都改不了。改：新增、修改。管：改，再加上在這裡加人、改等級、移出。Co-President 與 Senior Adviser 不用派，本來就全部都有（Senior Adviser 記不了錢）。", en: "View: sees it, cannot change anything. Edit: creates and changes things. Manage: Edit, plus adds people here, changes their level or removes them. Co-Presidents and Senior Advisers need no assignment; they already have everything (Senior Advisers cannot record money)." },
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
  "ma.selOne":       { zh: "選「{name}」", en: "Select {name}" },
  "ma.setN":         { zh: "{n} 個人改成這一級", en: "Set {n} {n:person|people}" },
  "ma.removeN":      { zh: "移出 {n} 個人", en: "Remove {n} {n:person|people}" },
  "msg.maLevel":     { zh: "{n} 個人改成「{level}」。", en: "{n} {n:person|people} set to {level}." },
  "msg.maRemoved":   { zh: "{n} 個人移出了。", en: "{n} {n:person|people} removed." },
  "msg.maUndone":    { zh: "復原了，回到剛剛那樣。", en: "Undone. Back to how it was." },
  "confirm.maRemove": { zh: "把勾起來的 {n} 個人移出？", en: "Remove the {n} selected {n:person|people}?" },
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
  // 進不去（搜尋每一位幹部都進得來，這三句是機制要的，畫面用不到）
  "noAccess.title":   { zh: "這一頁是給幹部用的", en: "This page is for members" },
  "noAccess.lede":    { zh: "搜尋只有幹部帳號用得了。", en: "Search is only available to member accounts." },
  "noAccess.back":    { zh: "回首頁", en: "Back to home" },

  // ── 頁首與搜尋框 ──
  "pg.title":         { zh: "搜尋", en: "Search" },
  "pg.lede":          { zh: "一次找會議紀錄、回饋表、內部表單與活動檢討。你只會看到你點開原本那一頁也看得到的東西。", en: "Search meeting notes, feedback forms, internal forms and event reviews at once. You only see what you could already open on the original page." },
  "q.label":          { zh: "要找什麼", en: "What are you looking for" },
  "q.ph":             { zh: "例如：bootcamp、場地、報名人數", en: "For example: bootcamp, venue, sign-ups" },
  "q.go":             { zh: "搜尋", en: "Search" },
  "q.hint":           { zh: "打兩個以上的詞，每一個都要提到才算。", en: "With two or more words, each one has to appear." },
  "q.hintAi":         { zh: "打兩個以上的詞，每一個都要提到才算；最上面那一段整理也會找意思接近的寫法。", en: "With two or more words, each one has to appear. The summary at the top also looks for other ways of saying the same thing." },

  // ── 篩選 ──
  "f.sources":        { zh: "找哪裡", en: "Where to look" },
  "f.kind":           { zh: "回饋表的種類", en: "Feedback form type" },
  "f.kindAll":        { zh: "全部種類", en: "All types" },
  "f.event":          { zh: "活動", en: "Event" },
  "f.eventAll":       { zh: "全部活動", en: "All events" },
  "f.from":           { zh: "從", en: "From" },
  "f.to":             { zh: "到", en: "To" },
  "f.clear":          { zh: "篩選全部拿掉", en: "Clear filters" },
  "f.eventHint":      { zh: "選了活動或種類，就只剩回饋表與活動檢討（會議與內部表單沒有掛活動）。", en: "Picking an event or a type leaves only feedback forms and event reviews (meetings and internal forms aren't tied to an event)." },
  "src.meeting":      { zh: "會議紀錄", en: "Meeting notes" },
  "src.feedback":     { zh: "回饋表", en: "Feedback forms" },
  "src.internal":     { zh: "內部表單", en: "Internal forms" },
  "src.review":       { zh: "活動檢討", en: "Event reviews" },
  "kind.post-event":  { zh: "活動後的回饋", en: "After an event" },
  "kind.alumni-yearly": { zh: "校友每年一次", en: "Alumni, yearly" },
  "kind.other":       { zh: "其他", en: "Other" },

  // ── 結果 ──
  "r.count":          { zh: "找到 {n} 筆", en: "{n} {n:result|results}" },
  "r.none":           { zh: "找不到", en: "Nothing found" },
  "r.noneHint":       { zh: "換一個詞試試，或把篩選拿掉。英文與中文分開找，例如 bootcamp 跟探索營要各找一次。", en: "Try another word, or clear the filters. English and Chinese are matched separately, so try both bootcamp and 探索營." },
  "r.start":          { zh: "從上面那一格開始", en: "Start with the box above" },
  "r.startHint":      { zh: "會議紀錄全部幹部都找得到。回饋表、內部表單與活動檢討，要你讀得到那一份才會出現。配對回饋（mentee 寫 mentor 的）不進搜尋。", en: "Every member can search meeting notes. Feedback forms, internal forms and event reviews show up only when you can read that one. Mentorship pair check-ins are never searched." },
  "r.answers":        { zh: "{n} 則回答提到", en: "{n} {n:answer mentions|answers mention} it" },
  "r.near":           { zh: "意思接近", en: "Similar meaning" },
  "r.open":           { zh: "打開原本那一頁", en: "Open the original" },
  "r.titleOnly":      { zh: "標題對上了", en: "Matched the title" },

  // ── 最上面的整理 ──
  "ai.title":         { zh: "整理", en: "Summary" },
  "ai.working":       { zh: "正在整理，大約十到三十秒。底下的清單先看得到。", en: "Summarising, usually 10 to 30 seconds. The list below is ready now." },
  "ai.empty":         { zh: "這幾筆裡沒有可以給 AI 讀的（現在給 AI 讀的是：{list}），所以沒有整理，清單照樣在底下。", en: "None of these results can be sent to the AI (it may read: {list}), so there is no summary. The list is below." },
  "ai.nothing":       { zh: "找到的東西沒有真的在講這件事。", en: "The results don't really talk about this." },
  "ai.failed":        { zh: "這一次整理不出來，底下的清單照樣看得到。", en: "No summary this time. The list below still works." },
  "ai.cite":          { zh: "看第 {n} 筆", en: "See excerpt {n}" },
  "ai.note":          { zh: "AI 只讀了這些片段，可能讀錯。重要的事點進原本那一頁確認。", en: "The AI read only these excerpts and can be wrong. Check the original for anything important." },
  "ai.used":          { zh: "你今天整理了 {n} 次，上限 {max} 次。", en: "{n} of your {max} summaries used today." },
  "ai.limit":         { zh: "今天的整理用完了，明天再試，或直接看清單。", en: "You have used today's summaries. The list still works." },
  "ai.off":           { zh: "最上面那一段整理還沒開：Co-President 要先在 Supabase 的 Vault 放 ANTHROPIC_API_KEY（大學研究那一把就可以）。步驟在 README「後台的搜尋」。", en: "The summary at the top is off until a Co-President puts ANTHROPIC_API_KEY in Supabase Vault (the college research key works). Steps are in the README, \"Backstage search\"." },

  // ── Co-President 的設定 ──
  "set.title":        { zh: "哪幾種可以給 AI 讀", en: "What the AI may read" },
  "set.lede":         { zh: "勾起來的那幾種，搜尋的時候會把片段送給 Anthropic（Claude）寫整理，也會送給 Voyage 換成一串數字，才找得到意思接近的寫法。沒勾的照樣搜得到，只是不送出去、不進整理。只有 Co-President 看得到這一格。", en: "For the ticked kinds, search sends excerpts to Anthropic (Claude) to write the summary, and to Voyage to turn them into numbers so similar wording can be found. Unticked kinds are still searchable; they are just not sent out or summarised. Only Co-Presidents see this." },
  "set.feedbackWarn": { zh: "回饋表多半是未成年的學員寫的。打開之前，先把隱私政策第三方那一張表補上 Anthropic 與 Voyage。", en: "Most feedback is written by students under 18. Before ticking it, add Anthropic and Voyage to the third-party table in the privacy policy." },
  "set.save":         { zh: "存起來", en: "Save" },
  "set.saved":        { zh: "存好了，關掉的那幾種存好的數字也刪掉了。", en: "Saved. Stored numbers for unticked kinds were deleted." },
  "set.keys":         { zh: "Vault 的金鑰：Claude {c}、Voyage {v}。", en: "Keys in Vault: Claude {c}, Voyage {v}." },
  "set.have":         { zh: "有", en: "set" },
  "set.missing":      { zh: "沒有", en: "missing" },
  "set.cost":         { zh: "最近 30 天：{n} 次整理，大約 US${usd}。", en: "Last 30 days: {n} {n:summary|summaries}, about US${usd}." },
  "set.embed":        { zh: "換成數字的小段：{done}／{all}。", en: "Excerpts turned into numbers: {done} of {all}." },
  "set.embedErr":     { zh: "Voyage 上一次回的錯誤：", en: "Last Voyage error: " },
  "set.voyageOff":    { zh: "沒有 Voyage 的金鑰也找得到，只是少了「意思接近」那一種。放金鑰之前先在 Voyage 關掉「拿資料訓練」，步驟在 README。", en: "Search works without the Voyage key; it just can't find similar wording. Turn off training on your data in Voyage before adding the key; steps are in the README." },

  // ── 錯誤與資料庫的代碼 ──
  "err.search":       { zh: "搜不到：", en: "Search failed: " },
  "err.ask":          { zh: "整理不了：", en: "Couldn't summarise: " },
  "err.load":         { zh: "載不到：", en: "Couldn't load: " },
  "says.notCadre":    { zh: "搜尋只有幹部帳號用得了。", en: "Search is only for member accounts." },
  "says.notPresident":{ zh: "只有 Co-President 改得了這一格。", en: "Only Co-Presidents can change this." },
  "says.aiNotReady":  { zh: "整理還沒開（Vault 沒有金鑰）。", en: "The summary is off (no key in Vault)." },
  "says.tooMany":     { zh: "今天的整理用完了。", en: "No summaries left today." },
  "says.tooShort":    { zh: "至少打兩個字。", en: "Type at least two characters." },
  "says.notFound":    { zh: "找不到這一次搜尋。", en: "That search was not found." },
  "says.noTables":    { zh: "資料庫還沒更新：要先在 Supabase 跑 2027-01-21-smart-search.sql。", en: "The database is not updated yet: run 2027-01-21-smart-search.sql in Supabase first." },
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
