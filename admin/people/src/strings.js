// 後台「人與權限」那一組的字典：畫面上每一句中文與英文並排（2026-10-19，後台中英切換）。
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
  "board.member":     { zh: "一般幹部", en: "Member" },
  "board.director":   { zh: "Director", en: "Director" },
  "board.president":  { zh: "Co-President", en: "Co-President" },
  "why.president":    { zh: "只有 Co-President 進得去", en: "Co-Presidents only" },
  "why.internStaff":  { zh: "只有 Internship team 的幹部與 Co-President 進得去", en: "Internship team and Co-Presidents only" },
  // 走錯地方、連不上
  "notCadre.title":   { zh: "這一頁是給幹部用的", en: "This page is for cadres" },
  "notCadre.lede":    { zh: "你的帳號是學員，後台看不到。", en: "Your account is a student account, so the admin is not available." },
  "notCadre.back":    { zh: "回我的帳號", en: "Back to my account" },
  "down.title":       { zh: "資料庫休眠中", en: "Database is asleep" },
  "down.lede":        { zh: "現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。",
                        en: "We cannot reach the database right now. Email beyondtaiwan2020@gmail.com to have it woken up." },
};

export const MINE = {
  // 職位
  "role.member.hint":   { zh: "看得到自己 team 的申請，改不動", en: "Sees their own team's applications, cannot edit" },
  "role.director.hint": { zh: "開表單、審核、寄信，只限自己的 team", en: "Creates forms, reviews, sends emails, own team only" },
  "role.president.hint":{ zh: "整個後台，包括這一頁", en: "The whole admin, including this page" },
  "field.board_role":   { zh: "職位", en: "Role" },
  "field.team":         { zh: "team", en: "team" },
  "value.none":         { zh: "（沒有）", en: "(none)" },
  // 幹部名單
  "ro.all":           { zh: "全部", en: "All" },
  "ro.noTeam":        { zh: "還沒填 team", en: "No team yet" },
  "ro.you":           { zh: "這是你", en: "This is you" },
  "ro.noName":        { zh: "還沒填名字", en: "No name yet" },
  "ro.priv":          { zh: "（有後台權限）", en: " (admin access)" },
  "ro.noTeamCell":    { zh: "沒有填 team", en: "No team set" },
  "ro.edit":          { zh: "改職位或 team", en: "Edit role or team" },
  "ro.title":         { zh: "幹部名單", en: "Roster" },
  "ro.lede":          { zh: "{n} 位幹部。職位決定他在後台管到哪，team 決定管哪一個 team 的東西。", en: "{n} {n:cadre|cadres}. The role decides what they can reach in the admin, the team decides which team's things." },
  "ro.note":          { zh: "每一筆改動都會記在<a href=\"#changes\" data-act=\"tab\" data-t=\"changes\">變動紀錄</a>，兩位 Co-President 都看得到。把人升成 Co-President 等於把整個後台給他，包括把你降級。\n      Director 與 Co-President 的 team 只能在這裡改；一般幹部自己在設定頁勾，但勾進{priv}要在這裡加。",
                        en: "Every change is written to the <a href=\"#changes\" data-act=\"tab\" data-t=\"changes\">change log</a>, which both Co-Presidents can see. Promoting someone to Co-President hands them the whole admin, including demoting you. Directors' and Co-Presidents' teams can only be changed here. Members tick their own teams under Settings, but joining {priv} has to be done here." },
  "ro.privFallback":  { zh: "會長出權限的 team", en: "a team that grants admin access" },
  "ro.name":          { zh: "名字", en: "Name" },
  "ro.role":          { zh: "職位", en: "Role" },
  "ro.team":          { zh: "team", en: "team" },
  "ro.emptyFilter":   { zh: "這個篩選裡沒有人", en: "Nobody in this filter" },
  "ro.emptyFilterHint": { zh: "換一個 team 看看。", en: "Try another team." },
  "ro.empty":         { zh: "名單載不到或還沒有幹部", en: "The roster did not load or there are no cadres yet" },
  "ro.emptyHint":     { zh: "重新整理再試一次。", en: "Refresh and try again." },
  // 變動紀錄
  "ch.gone":          { zh: "（已經不在名單上）", en: "(no longer on the roster)" },
  "ch.by":            { zh: "・{who} 改的・{d}", en: "・changed by {who}・{d}" },
  "ch.title":         { zh: "變動紀錄", en: "Change log" },
  "ch.lede":          { zh: "誰改了誰的職位或 team、從什麼到什麼、什麼時候。最近 30 筆。只有 Co-President 看得到。", en: "Who changed whose role or team, from what to what, and when. Last 30. Co-Presidents only." },
  "ch.empty":         { zh: "還沒有任何變動", en: "No changes yet" },
  "ch.emptyHint":     { zh: "這張紀錄從跑完 2026-10-21-people-admin.sql 那一天開始記。", en: "The log starts from the day 2026-10-21-people-admin.sql was run." },
  // 改一個人
  "pe.lede":          { zh: "現在是{role}{team}", en: "Currently {role}{team}" },
  "pe.team":          { zh: "，{team}", en: ", {team}" },
  "pe.back":          { zh: "回幹部名單", en: "Back to roster" },
  "pe.role":          { zh: "職位", en: "Role" },
  "pe.selfNote":      { zh: "自己的職位不能在這裡改（不能自我降級）。要交棒的話，先把對方升成 Co-President，再請對方把你降下來。", en: "You cannot change your own role here (no self-demotion). To hand over, promote the other person to Co-President first and have them demote you." },
  "pe.teams":         { zh: "所屬 team（可以選好幾個）", en: "Teams (pick as many as apply)" },
  // 進不去
  "noAccess.title":   { zh: "這一組只有 Co-President 用得到", en: "This section is for Co-Presidents only" },
  "noAccess.lede":    { zh: "邀請碼、職位、team 都是當屆 Co-President 的事。要發碼或改權限，找他們。", en: "Invite codes, roles and teams are this term's Co-Presidents' job. To get a code or change access, ask them." },
  "noAccess.back":    { zh: "回後台首頁", en: "Back to admin home" },
  // 邀請碼
  "role.cadre":       { zh: "幹部", en: "cadre" },
  "role.alumni":      { zh: "校友", en: "alumnus" },
  "role.student":     { zh: "學員", en: "student" },
  "role.intern":      { zh: "實習生", en: "intern" },
  "grant.cadre":      { zh: "幹部碼", en: "Cadre code" },
  "grant.alumni":     { zh: "校友碼", en: "Alumni code" },
  "grant.intern":     { zh: "實習生碼", en: "Intern code" },
  "iv.formTitle":     { zh: "發一組新的碼", en: "Issue a new code" },
  "iv.code":          { zh: "碼（英文字母、數字、連字號）", en: "Code (letters, digits, hyphens)" },
  "iv.grants":        { zh: "給什麼身分", en: "Grants which role" },
  "iv.cadreOpt":      { zh: "幹部碼（會拿到幹部護照）", en: "Cadre code (gets the cadre passport)" },
  "iv.alumniOpt":     { zh: "校友碼（沒有護照）", en: "Alumni code (no passport)" },
  "iv.internOpt":     { zh: "實習生碼（會拿到實習護照）", en: "Intern code (gets the intern passport)" },
  "iv.uses":          { zh: "可以用幾次（一個人一組就填 1）", en: "Uses (1 for one code per person)" },
  "iv.note":          { zh: "備註：發給誰（只有這一頁看得到）", en: "Note: who it is for (only visible here)" },
  "iv.notePh":        { zh: "給課程組小明", en: "For Ming in Curriculum" },
  "iv.create":        { zh: "建立這組碼", en: "Create code" },
  "iv.suggest":       { zh: "換一組", en: "Suggest another" },
  "iv.left":          { zh: "還剩 {n} 次", en: "{n} {n:use|uses} left" },
  "iv.usedUp":        { zh: "用完了", en: "Used up" },
  "iv.noteLine":      { zh: "備註：{note}", en: "Note: {note}" },
  "iv.created":       { zh: "建立於：{d}・有紀錄的使用 {n} 次", en: "Created {d}・{n} recorded {n:use|uses}" },
  "iv.unknown":       { zh: "不知道", en: "unknown" },
  "iv.disable":       { zh: "停用", en: "Disable" },
  "iv.whoUsed":       { zh: "誰用過（{n} 人，有 email，預設收著）", en: "Who used it ({n} {n:person|people}, includes email, collapsed by default)" },
  "iv.noEmail":       { zh: "（沒有 email）", en: "(no email)" },
  "iv.became":        { zh: "換成{role}", en: "became {role}" },
  "iv.nowIs":         { zh: "（現在是{role}）", en: " (now {role})" },
  "iv.title":         { zh: "邀請碼", en: "Invite codes" },
  "iv.lede":          { zh: "發新的碼、停用碼、看每一組還剩幾次與誰用過。", en: "Issue codes, disable codes, see how many uses each has left and who used them." },
  "iv.issued":        { zh: "已經發出去的碼", en: "Issued codes" },
  "iv.issuedNote":    { zh: "使用紀錄從 2026-10-14 開始。在那之前用掉的次數只會反映在「還剩幾次」，查不到是誰用的。<br>\n      停用就是把剩餘次數改成 0，後台沒有恢復的按鈕，要恢復得到 Supabase 改。碼不能刪，刪了就看不出紀錄是哪一組的。<br>\n      這一頁有每個人的 email，不要截圖傳出去。",
                        en: "Usage records start on 2026-10-14. Uses before that only show in \"uses left\", with no record of who.<br>Disabling sets the remaining uses to 0. There is no enable button here; to restore a code, edit it in Supabase. Codes cannot be deleted, or the records would not match any code.<br>This page has everyone's email. Do not screenshot and share it." },
  "iv.empty":         { zh: "還沒有任何邀請碼", en: "No invite codes yet" },
  "iv.emptyHint":     { zh: "上面發第一組，用複製貼上的方式給對方。", en: "Issue the first one above and send it by copy and paste." },
  // main.js 的訊息與確認
  "err.invitesLoad":  { zh: "邀請碼載不到：", en: "Could not load invite codes: " },
  "err.changesLoad":  { zh: "變動紀錄載不到：", en: "Could not load the change log: " },
  "err.rosterLoad":   { zh: "名單載不到：", en: "Could not load the roster: " },
  "err.noPerson":     { zh: "找不到這個人，重新整理再試一次。", en: "Person not found. Refresh and try again." },
  "err.nothingChanged": { zh: "沒有改到任何東西。", en: "Nothing changed." },
  "err.codeRequired": { zh: "碼要填。", en: "Enter a code." },
  "err.createCode":   { zh: "建不起來：", en: "Could not create: " },
  "err.disable":      { zh: "停用不了：", en: "Could not disable: " },
  "confirm.promote":  { zh: "把「{name}」升成 Co-President？\n\n他會拿到跟你一樣的全部權限，包括發邀請碼、改別人的職位、把你降級。這一筆會記在變動紀錄裡。", en: "Promote \"{name}\" to Co-President?\n\nThey get the same full access as you, including issuing invite codes, changing others' roles and demoting you. This is written to the change log." },
  "msg.roleTo":       { zh: "職位改成{role}", en: "role changed to {role}" },
  "msg.teamTo":       { zh: "team 改成{team}", en: "team changed to {team}" },
  "msg.personSaved":  { zh: "「{name}」{done}。已經記進變動紀錄。", en: "\"{name}\": {done}. Written to the change log." },
  "msg.partial":      { zh: "{done}存好了，但後面那一步", en: "{done} saved, but the next step failed. " },
  "msg.codeCreated":  { zh: "建好了：{code}。用複製貼上的方式給對方，不要口頭念。", en: "Created: {code}. Send it by copy and paste, do not read it out." },
  "confirm.disableCode": { zh: "停用「{code}」？\n\n停用之後這組碼就不能再用了。後台沒有恢復的按鈕，要恢復得到 Supabase 改。", en: "Disable \"{code}\"?\n\nThe code can no longer be used. There is no enable button here; to restore it, edit it in Supabase." },
  "msg.codeDisabled": { zh: "「{code}」已經停用。", en: "\"{code}\" disabled." },
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
