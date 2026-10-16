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

// ── 後台的分組列（2026-10-15）──────────────────────────────────────────
// 後台拆成四個資料夾，每一頁最上面都是這一排。**四個資料夾各有一份**
//（資料夾之間不互相 import，跟 esc() 同一條規矩），test/admin-hub.test.mjs
// 拿同一張輸入表比對四份講一樣的話。漂移的表現是「在 A 頁看得到的組，到 B 頁不見了」。
//
// who 是「誰進得去」，只決定畫面上那一格是連結還是灰字。
// **真正的門在每個資料夾的 main.js 開頁第一句，以及資料庫的函式與 RLS。**
export const GROUPS = [
  { key: "forms",     label: "申請",     href: "/admin/",           who: "cadre",        hint: "申請表、審核、簽到、行前信" },
  { key: "site",      label: "對外",     href: "/admin/site/",      who: "cadre",        hint: "資源、團隊頁、校友頁、信件文案" },
  { key: "passports", label: "護照",     href: "/admin/passports/", who: "intern-staff", hint: "兩本護照的格子" },
  { key: "people",    label: "人與權限", href: "/admin/people/",    who: "president",    hint: "邀請碼、職位、team" },
];
// me = { role, board, team }。team 可能是逗號字串（一個人在好幾個 team）。
export function canEnter(g, me) {
  if (!me || me.role !== "cadre") return false;
  if (g.who === "cadre") return true;
  if (g.who === "president") return me.board === "president";
  if (g.who === "intern-staff") return me.board === "president" || String(me.team || "").includes("Internship Team");
  return false;
}
export function groupBarHTML(current, me) {
  return `<nav class="groups" aria-label="後台的分組">${GROUPS.map(g => canEnter(g, me)
    ? `<a class="chip wide${g.key === current ? " on" : ""}" data-group="${g.key}" href="${g.href}"${
        g.key === current ? ' aria-current="page"' : ""}>${esc(g.label)}</a>`
    : `<span class="chip wide off" title="${esc(g.who === "president" ? "只有 Co-President 進得去" : "只有 Internship team 的幹部與 Co-President 進得去")}">${esc(g.label)}</span>`
  ).join("")}</nav>`;
}

// 這一組裡面的分頁。資源所有幹部看得到；團隊頁、校友頁、信件文案只有 Co-President。
export function tabsHTML(tab, isPresident) {
  return `<div class="chips" style="margin-bottom:16px">
    <button class="chip wide${tab === "res" ? " on" : ""}" data-act="tab" data-t="res">資源</button>
    ${isPresident ? `<button class="chip wide${tab === "team" ? " on" : ""}" data-act="tab" data-t="team">團隊頁</button>
    <button class="chip wide${tab === "stories" ? " on" : ""}" data-act="tab" data-t="stories">校友頁</button>
    <button class="chip wide${tab === "mail" ? " on" : ""}" data-act="tab" data-t="mail">信件文案</button>` : ""}
  </div>`;
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
  return `<div class="card">
    ${tabsHTML("team", true)}
    <h2>團隊頁</h2>
    <div class="sub">誰出現在對外的 /team/ 上。已經公開 ${on} 人。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="wnote big">核可之前確認兩件事：<br>
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
    }).join("")}</ul>` : `<div class="empty">還沒有人自己打勾。<br>
      幹部要先到 /app/ 打勾同意，才會出現在這裡。</div>`}
  </div>`;
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
  return `<div class="card">
    ${tabsHTML("stories", true)}
    <h2>校友頁</h2>
    <div class="sub">誰出現在對外的 /alumni/ 航線圖上。已經公開 ${on} 人。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="wnote big">核可之前確認三件事：<br>
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
      </li>`).join("")}</ul>` : `<div class="empty">還沒有人勾同意。<br>
      幹部與校友要先到「設定」把故事填完並勾同意，才會出現在這裡。</div>`}
  </div>`;
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

  return `<div class="card">
    <h2>資源</h2>
    <div class="sub">BT 產出的免費資源。這裡放的是**一條連結**，不是檔案。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    ${tabsHTML("res", isPresident)}
    ${canEdit ? `<div class="row" style="margin-bottom:6px">
      <button class="btn" data-act="res-new">加一個資源</button>
    </div>` : `<div class="wnote">你可以看，但改不動。</div>`}
    ${items.length ? `<ul class="flist">${rows}</ul>` : `<div class="empty">還沒有任何資源。</div>`}
  </div>`;
}

export function resEditHTML(r, msg, busy) {
  const cur = r || { title: "", blurb: "", kind: "pdf", url: "", team: "", status: "draft", ord: 100 };
  return `<div class="card">
    <div class="row" style="margin:0 0 14px">
      <button class="btn quiet" data-act="res-back">← 回資源清單</button>
    </div>
    <h2>${r ? "改一個資源" : "加一個資源"}</h2>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <label><i>名稱</i><input id="rtitle" value="${esc(cur.title)}" placeholder="申請文書怎麼開頭"></label>
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
    <div class="wnote">發布之前，<b>用無痕視窗打開這條連結自己點一次</b>。
      Drive 的分享權限如果設成「只有我」，這裡完全看不出來，
      而學生看到的會是一頁「你需要存取權」。</div>
    <div class="row">
      <button class="btn" data-act="res-save" ${busy ? "disabled" : ""}>${busy ? "存檔中…" : "存起來"}</button>
      ${r ? `<button class="btn quiet" data-act="res-del" data-id="${esc(r.id)}">刪掉</button>` : ""}
    </div>
  </div>`;
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
  return `<div class="card">
    <h2>信件文案</h2>
    <div class="sub">系統寄出去的四封信。只有 Co-President 改得動。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    ${tabsHTML("mail", true)}
    <ul class="flist">${MAIL_KINDS.map(k => {
      const t = items.find(x => x.kind === k.v);
      return `<li>
        <div class="fhead"><b>${esc(k.label)}</b></div>
        <div class="fmeta">${esc(k.when)}</div>
        <div class="fmeta">主旨：${esc((t && t.subject) || "（還沒有）")}</div>
        <div class="row">
          <button class="btn ghost sm" data-act="mail-edit" data-k="${esc(k.v)}">改這一封</button>
        </div>
      </li>`;
    }).join("")}</ul>
  </div>`;
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
  return `<div class="card">
    <div class="row" style="margin:0 0 14px">
      <button class="btn quiet" data-act="mail-back">← 回信件清單</button>
    </div>
    <h2>${esc(k.label)}</h2>
    <div class="sub">${esc(k.when)}寄出。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <label><i>主旨</i><input id="msub" value="${esc(subject)}"></label>
    <label><i>內文</i><textarea id="mbody" style="min-height:230px">${esc(body)}</textarea></label>
    <div class="mini" style="margin:-6px 0 14px">
      可以用兩個代換符號：<b>{姓名}</b> 與 <b>{活動名稱}</b>。
      打錯或刪掉不會壞掉，那個位置會空著 —— 右邊的預覽會直接讓你看到。</div>

    <h3 style="font-family:var(--display);font-size:20px;margin:26px 0 6px">寄出去會長這樣</h3>
    <div class="mini" style="margin-bottom:8px">用「${esc(NAME)}」與「${esc(TITLE)}」當範例。</div>
    <div class="mailprev"><b>${esc(fillMail(subject, NAME, TITLE)) || "（沒有主旨）"}</b><pre>${
      esc(fillMail(body, NAME, TITLE) + extra)}</pre><pre class="tail">${esc(mailTail(kind))}</pre></div>
    <div class="mini" style="margin:6px 0 0">
      灰色那一段是<b>系統自己加的，改不掉</b>。「不要回覆這封信」是必要資訊：
      那個信箱沒有人看，按回覆會被退回，而收信的人只會覺得沒有人理他。</div>

    <div class="row">
      <button class="btn" data-act="mail-save" data-k="${esc(kind)}" ${busy ? "disabled" : ""}>${
        busy ? "存檔中…" : "存起來"}</button>
    </div>
  </div>`;
}

// 學員或還沒升級的人走到這裡。**不說「你沒有權限」**：他沒有做錯任何事，只是走錯地方。
export function notCadreHTML() {
  return `<div class="card">
    <h2>這一頁是給幹部用的</h2>
    <div class="sub">你的帳號是學員，後台看不到。</div>
    <div class="row"><a class="btn ghost" href="../../app/">回我的帳號</a></div>
  </div>`;
}

export function downHTML() {
  return `<div class="card">
    <h2>資料庫休眠中</h2>
    <div class="wnote big" style="margin-top:16px">現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。</div>
    <div class="row"><button class="btn ghost" data-act="retry">再試一次</button></div>
  </div>`;
}
