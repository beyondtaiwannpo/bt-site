// 後台「對外」那一組的畫面：資源、團隊頁、校友頁、信件文案。
// 2026-10-15 從 admin/src/ui.js 原樣搬過來（後台拆成四個資料夾）。
// **esc 與 namesOf 是自己的一份**，不從別的資料夾 import。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 一個人在畫面上要顯示的兩個名字（2026-09-10）。**同一份規則在
// passport/src/ui.js 與 availability/src/data.js 也各有一份**
// （資料夾之間不互相 import）。三份漂移的表現是「同一個人在三個地方顯示的名字
// 不一樣」，不會報錯。test/names.test.mjs 拿同一張輸入表逐項比對三份。
export function namesOf(p) {
  const zh = String(p.name_zh || "").trim();
  const en = String(p.name_en || "").trim();
  return {
    name: zh || en || "（沒有名字）",
    alt: zh && en && zh !== en ? en : "",
  };
}

// ── 後台的側欄與外殼（2026-10-19，後台第二次重整）──────────────────────
// 後台拆成四個資料夾，每一頁左邊都是這一條側欄。**四個資料夾各有一份這一段**
//（資料夾之間不互相 import，跟 esc() 同一條規矩），test/admin-hub.test.mjs
// 逐字比對四份一模一樣。漂移的表現是「在 A 頁看得到的分頁，到 B 頁不見了」，不會報錯。
//
// GROUPS 是四組，ITEMS 是每一組底下的分頁。who 是「誰看得到」，
// 只決定側欄上那一行是連結還是淡字。**真正的門在每個資料夾的 main.js 開頁第一句，
// 以及資料庫的函式與 RLS。**
export const GROUPS = [
  { key: "forms",     label: "申請",     href: "/admin/",           who: "cadre",        hint: "申請表、審核、簽到、行前信" },
  { key: "site",      label: "對外",     href: "/admin/site/",      who: "cadre",        hint: "資源、團隊頁、校友頁、信件文案" },
  { key: "passports", label: "護照",     href: "/admin/passports/", who: "intern-staff", hint: "兩本護照的格子" },
  { key: "people",    label: "人與權限", href: "/admin/people/",    who: "president",    hint: "邀請碼、職位、team" },
];
// 側欄上每一行。要加一個新的後台分頁，就在這裡加一行（四份都要加），
// 然後在那一組的 ui.js 加一個畫面函式、main.js 接 data-act="tab" data-t="<key>"。
export const ITEMS = [
  { group: "forms",     key: "home",    label: "首頁",     who: "cadre" },
  { group: "forms",     key: "forms",   label: "申請表",   who: "cadre" },
  { group: "site",      key: "res",     label: "資源",     who: "cadre" },
  { group: "site",      key: "team",    label: "團隊頁",   who: "president" },
  { group: "site",      key: "stories", label: "校友頁",   who: "president" },
  { group: "site",      key: "mail",    label: "信件文案", who: "president" },
  { group: "passports", key: "interns", label: "實習護照", who: "intern-staff" },
  { group: "passports", key: "cadre",   label: "幹部護照", who: "president" },
  { group: "people",    key: "roster",  label: "幹部名單", who: "president" },
  { group: "people",    key: "invites", label: "邀請碼",   who: "president" },
];
const WHY = { president: "只有 Co-President 進得去", "intern-staff": "只有 Internship team 的幹部與 Co-President 進得去" };
// me = { role, board, team, name }。team 可能是逗號字串（一個人在好幾個 team）。
function allowed(who, me) {
  if (!me || me.role !== "cadre") return false;
  if (who === "cadre") return true;
  if (who === "president") return me.board === "president";
  if (who === "intern-staff") return me.board === "president" || String(me.team || "").includes("Internship Team");
  return false;
}
export function canEnter(g, me) { return allowed(g.who, me); }
export function canSee(item, me) { return allowed(item.who, me); }
const BOARD_ZH = { member: "一般幹部", director: "Director", president: "Co-President" };

// 側欄。group 是現在在哪一組，tab 是哪一個分頁，counts 是 { <key>: 數字 }（有才顯示，批 2 的首頁會餵）。
// 同一組裡的分頁是 data-act="tab"（不重新載入頁面）；別組的是一般連結，帶 #key 讓那一頁開在對的分頁。
export function railHTML(group, tab, me, counts) {
  const c = counts || {};
  const item = it => {
    const on = it.group === group && it.key === tab;
    const n = c[it.key] ? `<span class="rail-count">${esc(String(c[it.key]))}</span>` : "";
    if (!canSee(it, me)) return `<span class="rail-item off">${esc(it.label)}</span>`;
    const href = it.group === group ? `#${it.key}` : `${GROUPS.find(g => g.key === it.group).href}#${it.key}`;
    return `<a class="rail-item${on ? " on" : ""}" href="${href}"${it.group === group ? ` data-act="tab" data-t="${it.key}"` : ""}${
      on ? ' aria-current="page"' : ""}>${esc(it.label)}${n}</a>`;
  };
  const home = ITEMS.find(i => i.key === "home");
  const groups = GROUPS.map(g => {
    const ok = canEnter(g, me);
    const rows = ITEMS.filter(i => i.group === g.key && i.key !== "home");
    return `<div class="rail-group${ok ? "" : " off"}">${esc(g.label)}${ok ? "" : `<span class="why">${esc(WHY[g.who] || "")}</span>`}</div>${
      ok ? rows.map(item).join("") : rows.map(i => `<span class="rail-item off">${esc(i.label)}</span>`).join("")}`;
  }).join("");
  const teams = String(me && me.team || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
  return `<input class="rail-toggle" type="checkbox" id="rail-toggle" aria-label="展開後台選單">
  <label class="rail-burger" for="rail-toggle">後台選單</label>
  <nav class="rail" aria-label="後台的分組">
    <div class="rail-me"><b>${esc(me && me.name || "")}</b>
      <span>${esc(BOARD_ZH[me && me.board] || "一般幹部")}${teams.length ? "・" + esc(teams.join("、")) : "・還沒填 team"}</span></div>
    ${item(home)}
    ${groups}
    <div class="rail-foot">對外七頁（首頁、關於、計畫、做過什麼、合作、團隊、Alumni）的文字在 HTML 檔裡，不在後台。改法見 README「對外的內容頁」。</div>
  </nav>`;
}

// 整頁的外殼：頂欄在上，底下左側欄、右內容。
export function shellHTML(nav, rail, body) {
  return `${nav}<div class="shell${rail ? "" : " solo"}">${rail || ""}<main class="main">${body}</main></div>`;
}

// ── 每一頁共用的五個小零件。畫面函式只拼這些，不自己寫 class。 ──────────
// 頁首：標題、一句說明、右邊最多兩顆動作。actions = [{ act, label, primary, href, disabled, id }]
export function pageHead(title, lede, actions, back) {
  const btn = a => a.href
    ? `<a class="btn${a.primary ? "" : " ghost"}" href="${esc(a.href)}">${esc(a.label)}</a>`
    : `<button class="btn${a.primary ? "" : " ghost"}" data-act="${esc(a.act)}"${a.id ? ` data-id="${esc(a.id)}"` : ""}${a.disabled ? " disabled" : ""}>${esc(a.label)}</button>`;
  return `${back ? `<button class="back" data-act="${esc(back.act)}"${back.id ? ` data-id="${esc(back.id)}"` : ""}>← ${esc(back.label)}</button>` : ""}
  <header class="page-head"><div class="ph-text"><h1>${title}</h1>${lede ? `<div class="lede">${lede}</div>` : ""}</div>${
    actions && actions.length ? `<div class="actions">${actions.map(btn).join("")}</div>` : ""}</header>`;
}
// 訊息。做成了是綠的，沒做成是橘的。判斷靠訊息開頭那幾個字（「存不起來：」「載不到：」這一類是沒做成）。
export function msgKind(msg) {
  const s = String(msg || "");
  if (!s) return "";
  if (/(不了|不到|不起來|不出來|不掉|失敗|沒寄成功)[：:]/.test(s) || /要(填|寫|有)|不能|至少|沒有改到|都要|開不出|還沒有題目|先選|^沒有/.test(s)) return "err";
  return "ok";
}
export function msgHTML(msg) {
  const k = msgKind(msg);
  if (!k) return "";
  return `<div class="msg ${k}" role="status"><span class="msg-k">${k === "err" ? "沒成" : "好了"}</span><span>${esc(msg)}</span></div>`;
}
// 區塊：一個 h2 一塊。opts = { id, hint, actions: [{ act, label, ...data }] }
export function sectionHTML(title, body, opts) {
  const o = opts || {};
  const acts = (o.actions || []).map(a => `<button class="btn quiet sm" data-act="${esc(a.act)}"${
    Object.keys(a).filter(k => !["act", "label"].includes(k)).map(k => ` data-${k}="${esc(String(a[k]))}"`).join("")}${a.disabled ? " disabled" : ""}>${esc(a.label)}</button>`).join("");
  return `<section class="section"${o.id ? ` id="${esc(o.id)}"` : ""}>${
    title ? `<h2>${title}${o.hint ? `<span class="hint">${o.hint}</span>` : ""}${acts ? `<span class="sp"></span>${acts}` : ""}</h2>` : ""}${body}</section>`;
}
// 空狀態：一句講「這裡還沒有東西」，一句講「要怎麼開始」，一顆按鈕直接做。
export function emptyHTML(title, hint, action) {
  return `<div class="empty"><b>${esc(title)}</b>${hint ? `<div>${hint}</div>` : ""}${
    action ? `<div class="row"><button class="btn ghost sm" data-act="${esc(action.act)}"${action.id ? ` data-id="${esc(action.id)}"` : ""}>${esc(action.label)}</button></div>` : ""}</div>`;
}
// 載入中。
export function skeletonHTML() { return `<div class="skeleton" aria-label="載入中"><i></i><i></i><i></i></div>`; }

// 舊名字：這一組底下的分頁。側欄用同一份 ITEMS 畫，這一支留給測試與 scripts/mobile-fixtures.mjs。
export function tabsHTML(tab, isPresident) {
  const me = { role: "cadre", board: isPresident ? "president" : "member", team: "Internship Team" };
  return ITEMS.filter(i => i.group === "site" && i.key !== "home" && canSee(i, me))
    .map(i => `<a class="rail-item${i.key === tab ? " on" : ""}" href="#${i.key}" data-act="tab" data-t="${i.key}">${esc(i.label)}</a>`).join("");
}

// ═══════════════════════════════════════════════════════════════════════
// 批 5：資源
// ═══════════════════════════════════════════════════════════════════════
export const RES_KINDS = [
  { v: "pdf", label: "PDF" }, { v: "video", label: "影片" },
  { v: "slides", label: "投影片" }, { v: "sheet", label: "表格" },
  { v: "book", label: "手冊" }, { v: "link", label: "連結" },
];

// 團隊頁的核可。**只有 Co-President 看得到這個分頁**（核可是他們的鑰匙）。
//
// ⚠ 那兩句提醒不是裝飾。系統沒有生日欄位，「未滿 18 不放」技術上擋不住，
// 而大頭照對外是超出現行隱私政策告知範圍的新用途。
// 這一頁是這兩件事**唯一會被看到的地方**。
// ⚠ 這一頁只有 Co-President 看得到（呼叫端已經擋過），所以分頁列
// 直接把 isPresident 寫死成 true —— 少了這一列，核可完想回申請表
// 就只能重新整理整頁（小問題 7，總審查）。
export function publicTeamHTML(people, msg, busy) {
  const on = people.filter(p => p.public_approved).length;
  return pageHead("團隊頁", `誰出現在對外的 /team/ 上。已經公開 ${on} 人。`)
    + msgHTML(msg)
    + sectionHTML("", `<div class="note">核可之前確認兩件事：<br>
      1. <b>他滿 18 歲了嗎。</b>未滿一律不放，不管職位。系統沒有生日欄位，這一條只有你擋得住。<br>
      2. <b>隱私政策改了嗎。</b>現在的政策只說大頭照顯示在進度牆上，
         對外公開是新用途。名字撤得下來，照片被搜尋引擎存過撤不乾淨。</div>
    ${people.length ? `<ul class="flist">${people.map(p => {
      const { name, alt } = namesOf(p);
      return `<li>
        <div class="arow">
          <label class="apick"><input type="checkbox" data-act="approve" data-id="${esc(p.id)}"
            ${p.public_approved ? "checked" : ""}${busy ? " disabled" : ""}
            aria-label="核可 ${esc(name)}"></label>
          <div class="abody">
            <div class="fhead"><b>${esc(name)}${alt ? `<span class="alt">${esc(alt)}</span>` : ""}</b>
              ${p.public_approved ? `<span class="tag open">在公開頁面上</span>`
                                  : `<span class="tag">還沒核可</span>`}</div>
            <div class="fmeta">${esc([p.public_title, p.team].filter(Boolean).join("・") || "沒有填 team")}
              ${p.avatar ? "・有大頭照" : "・沒有大頭照"}</div>
          </div>
        </div>
      </li>`;
    }).join("")}</ul>` : emptyHTML("還沒有人自己打勾", "幹部要先到「設定」打勾同意出現在團隊頁，才會出現在這裡。")}`);
}

// 校友頁的核可（2026-09-11）。**只有 Co-President 看得到這個分頁**（核可是他們的鑰匙）。
//
// ⚠ 這裡要看到的是**內容**，不是名字。核可的意思是
// 「這段文字可以用 BT 的名義公開」，看不到那段文字就沒辦法判斷 ——
// 所以那一句話與那段介紹一律整段畫出來，不收在「點開才看得到」裡面。
// ⚠ touch_updated_at() 是 before update 的 trigger，核可本身也是一句 update，
// 所以按下核可之後 updated_at 會變成核可時間。對已核可的人顯示「內容最後改過」
// 就是在說謊——那是人做安全判斷時看的資訊（總審查 I5）。不改共用的 trigger，
// 改成這裡分開顯示：未核可看 updated_at，已核可看 approved_at。
export function alumniStoriesHTML(rows, msg, busy) {
  // rows 可能是 undefined（載入失敗那一瞬間）。**這一頁寧可少東西也不能空白**，
  // 那是這個 repo 的規矩：連不上資料庫也要畫得出東西。
  const list = rows || [];
  const on = list.filter(r => r.story_approved).length;
  // 等核可的排最上面 —— 這一頁的工作就是處理那幾個。
  // 資料庫那一支 stories_for_review() 已經 order by 過同一件事，這裡再排一次是
  // **刻意的**：畫面的順序不該取決於呼叫端剛好給了什麼順序，而這一支是純函式，
  // 測試守得住它。用穩定排序，所以同一組裡面仍然照資料庫給的順序（最近改過的在前）。
  const sorted = list.slice()
    .sort((a, b) => Number(!!a.story_approved) - Number(!!b.story_approved));
  return pageHead("校友頁", `誰出現在對外的 /alumni/ 航線圖上。已經公開 ${on} 人。`)
    + msgHTML(msg)
    + sectionHTML("", `<div class="note">核可之前確認三件事：<br>
      1. <b>他滿 18 歲了嗎。</b>未滿一律不放。系統沒有生日欄位，這一條只有你擋得住。<br>
      2. <b>他真的是 BT 校友嗎。</b>邀請碼可能被轉給別人。<br>
      3. <b>這段文字可以用 BT 的名義公開嗎。</b>核可之後他再改那一句話或介紹，
         系統會自動下架，重新回到這份清單上。</div>
    ${sorted.length ? `<ul class="flist">${sorted.map(r => `<li>
        <div class="arow">
          <label class="apick"><input type="checkbox" data-act="approve-story" data-id="${esc(r.id)}"
            ${r.story_approved ? "checked" : ""}${busy ? " disabled" : ""}
            aria-label="核可 ${esc(r.name)}"></label>
          <div class="abody">
            <div class="fhead"><b>${esc(r.name)}</b>
              ${r.story_approved ? `<span class="tag open">在公開頁面上</span>`
                                 : `<span class="tag">等核可</span>`}
              ${r.county ? "" : `<span class="tag">沒填縣市・不會出現在圖上</span>`}</div>
            <div class="fmeta">${esc([r.school, r.county].filter(Boolean).join("・"))}
              → ${esc([r.country, r.city, r.place].filter(Boolean).join("・"))}</div>
            <p class="fquote">${esc(r.quote || "")}</p>
            <p class="fmeta">${esc(r.note || "")}</p>
            <div class="fmeta">${r.story_approved
              ? `核可於：${esc(String(r.approved_at || "").slice(0, 10))}`
              : `內容最後改過：${esc(String(r.updated_at || "").slice(0, 10))}`}</div>
          </div>
        </div>
      </li>`).join("")}</ul>` : emptyHTML("還沒有人勾同意", "幹部與校友要先到「設定」把故事填完並勾同意，才會出現在這裡。")}`);
}

export function resListHTML(items, canEdit, msg, isPresident) {
  const rows = items.map(r => `<li>
    <div class="fhead">
      <b>${esc(r.title)}</b>
      <span class="tag ${r.status === "published" ? "open" : "draft"}">${
        r.status === "published" ? "已發布" : "還在寫"}</span>
      <span class="tag">${esc((RES_KINDS.find(k => k.v === r.kind) || RES_KINDS[5]).label)}</span>
    </div>
    <div class="fmeta">${esc(r.blurb || "還沒寫介紹")}</div>
    <div class="fmeta"><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.url)}</a></div>
    ${canEdit ? `<div class="row">
      <button class="btn ghost sm" data-act="res-edit" data-id="${esc(r.id)}">改</button>
    </div>` : ""}
  </li>`).join("");

  return pageHead("資源", "BT 產出的免費資源。這裡放的是<b>一條連結</b>，不是檔案。",
      canEdit ? [{ act: "res-new", label: "加一個資源", primary: true }] : [])
    + msgHTML(msg)
    + (canEdit ? "" : `<div class="note">你可以看，但改不動。資源由 Director 與 Co-President 維護。</div>`)
    + sectionHTML("", items.length ? `<ul class="flist">${rows}</ul>`
      : emptyHTML("還沒有任何資源", "加一條 Google Drive 或 YouTube 的連結，寫一句給高中生看的介紹，狀態改成已發布就會出現在 /resources/。",
                  canEdit ? { act: "res-new", label: "加一個資源" } : null));
}

export function resEditHTML(r, msg, busy) {
  const cur = r || { title: "", blurb: "", kind: "pdf", url: "", team: "", status: "draft", ord: 100 };
  return pageHead(r ? "改一個資源" : "加一個資源", "", [], { act: "res-back", label: "回資源清單" })
    + msgHTML(msg)
    + sectionHTML("", `<label><i>名稱</i><input id="rtitle" value="${esc(cur.title)}" placeholder="申請文書怎麼開頭"></label>
    <!-- ⚠ 介紹是**搜尋引擎唯一看得到的東西**（連結那一欄要登入才讀得到）。
         所以這一格要寫得像一句對高中生講的話，不是一行檔名。 -->
    <label><i>介紹（公開，沒登入的人也看得到，Google 也看得到）</i>
      <textarea id="rblurb" placeholder="這是什麼、為什麼有用。寫給一個第一次聽到 BT 的高中生看。">${esc(cur.blurb || "")}</textarea></label>
    <div class="two">
      <label><i>類型</i><select id="rkind">
        ${RES_KINDS.map(k => `<option value="${k.v}"${cur.kind === k.v ? " selected" : ""}>${esc(k.label)}</option>`).join("")}
      </select></label>
      <label><i>排序（小的在前）</i><input id="rord" type="number" value="${esc(String(cur.ord))}"></label>
      <label><i>哪一個 team 維護</i><input id="rteam" value="${esc(cur.team || "")}"></label>
      <label><i>狀態</i><select id="rstatus">
        <option value="draft"${cur.status === "draft" ? " selected" : ""}>還在寫（外面看不到）</option>
        <option value="published"${cur.status === "published" ? " selected" : ""}>已發布</option>
      </select></label>
    </div>
    <label><i>連結（Google Drive、YouTube、Canva…）</i>
      <input id="rurl" value="${esc(cur.url)}" placeholder="https://..."></label>
    <!-- 這一句是人的流程，不是程式。Drive 的分享權限設錯，網站看不出來，
         而使用者看到的是一頁「你需要存取權」。 -->
    <div class="note">發布之前，<b>用無痕視窗打開這條連結自己點一次</b>。
      Drive 的分享權限如果設成「只有我」，這裡完全看不出來，
      而學生看到的會是一頁「你需要存取權」。</div>
    <div class="form-foot">
      <button class="btn" data-act="res-save" ${busy ? "disabled" : ""}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="res-back">取消</button>
      ${r ? `<span class="sp"></span><button class="btn quiet danger" data-act="res-del" data-id="${esc(r.id)}">刪掉</button>` : ""}
    </div>`);
}

// ═══════════════════════════════════════════════════════════════════════
// 信件文案（2026-09-08）
// ═══════════════════════════════════════════════════════════════════════
export const MAIL_KINDS = [
  { v: "guardian",  label: "家長告知信", when: "學生送出申請、而且填了家長信箱的時候" },
  { v: "interview", label: "邀請面試",   when: "你按下「邀請面試」的時候" },
  { v: "accepted",  label: "錄取通知",   when: "你按下「錄取」的時候" },
  { v: "rejected",  label: "婉拒",       when: "你按下「婉拒」的時候" },
];
const kindOf = v => MAIL_KINDS.find(k => k.v === v) || MAIL_KINDS[0];

// 系統會自己加在每一封信最後面的那一段。**這裡只是把它顯示出來，不能改。**
// 「不要回覆這封信」是必要資訊不是禮貌用語 —— noreply 沒有 MX，
// 按回覆會被退回，而那個人只會覺得沒有人理他。
export function mailTail(kind) {
  return kind === "guardian"
    ? "這封信是告知，不需要回覆或簽名。有任何問題請寄到 beyondtaiwan2020@gmail.com。\n\nBeyond Taiwan"
    : "不要回覆這封信，這個信箱沒有人看。有問題請寄到 beyondtaiwan2020@gmail.com。\n\nBeyond Taiwan";
}

// 代換。**跟資料庫那一支 mail_fill() 是同一套規則**，
// 兩邊不一致的話預覽就會騙人 —— 而預覽騙人比沒有預覽糟。
export function fillMail(text, name, title) {
  return String(text == null ? "" : text)
    .split("{姓名}").join(name)
    .split("{活動名稱}").join(title);
}

export function mailListHTML(items, msg) {
  return pageHead("信件文案", "系統寄出去的四封信。只有 Co-President 改得動。")
    + msgHTML(msg)
    + sectionHTML("", `<ul class="flist">${MAIL_KINDS.map(k => {
      const t = items.find(x => x.kind === k.v);
      return `<li>
        <div class="fhead"><b>${esc(k.label)}</b></div>
        <div class="fmeta">${esc(k.when)}</div>
        <div class="fmeta">主旨：${esc((t && t.subject) || "（還沒有）")}</div>
        <div class="row">
          <button class="btn ghost sm" data-act="mail-edit" data-k="${esc(k.v)}">改這一封</button>
        </div>
      </li>`;
    }).join("")}</ul>`);
}

// 編輯一封信。**左邊改、右邊就是寄出去的樣子。**
// 這一頁的價值在預覽：代換符號打錯不會壞掉，只會空著，
// 而預覽是唯一會當場讓人看到「我把 {姓名} 打成 {名字} 了」的東西。
export function mailEditHTML(kind, t, msg, busy) {
  const k = kindOf(kind);
  const NAME = "陳小安", TITLE = "2027 暑期探索營";
  const subject = t ? t.subject : "";
  const body = t ? t.body : "";
  const extra = kind === "interview" ? "\n\n請從這個連結挑一個你方便的時段：\nhttps://cal.com/..." : "";
  return pageHead(esc(k.label), `${esc(k.when)}寄出。`, [], { act: "mail-back", label: "回信件清單" })
    + msgHTML(msg)
    + sectionHTML("", `<label><i>主旨</i><input id="msub" value="${esc(subject)}"></label>
    <label><i>內文</i><textarea id="mbody" style="min-height:230px">${esc(body)}</textarea></label>
    <div class="mini" style="margin:-6px 0 14px">
      可以用兩個代換符號：<b>{姓名}</b> 與 <b>{活動名稱}</b>。
      打錯或刪掉不會壞掉，那個位置會空著 —— 右邊的預覽會直接讓你看到。</div>

    <div class="form-foot">
      <button class="btn" data-act="mail-save" data-k="${esc(kind)}" ${busy ? "disabled" : ""}>${
        busy ? "存檔中…" : "存起來"}</button>
    </div>`)
    + sectionHTML("寄出去會長這樣", `<div class="mini" style="margin-bottom:8px">用「${esc(NAME)}」與「${esc(TITLE)}」當範例。</div>
    <div class="mailprev"><b>${esc(fillMail(subject, NAME, TITLE)) || "（沒有主旨）"}</b><pre>${
      esc(fillMail(body, NAME, TITLE) + extra)}</pre><pre class="tail">${esc(mailTail(kind))}</pre></div>
    <div class="mini" style="margin:6px 0 0">
      灰色那一段是<b>系統自己加的，改不掉</b>。「不要回覆這封信」是必要資訊：
      那個信箱沒有人看，按回覆會被退回，而收信的人只會覺得沒有人理他。</div>`);
}

// 學員或還沒升級的人走到這裡。**不說「你沒有權限」**：他沒有做錯任何事，只是走錯地方。
export function notCadreHTML() {
  return pageHead("這一頁是給幹部用的", "你的帳號是學員，後台看不到。", [{ label: "回我的帳號", href: "../../app/" }]);
}

export function downHTML() {
  return pageHead("資料庫休眠中", "現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。", [{ act: "retry", label: "再試一次" }]);
}
