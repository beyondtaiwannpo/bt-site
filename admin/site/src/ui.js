// 後台「對外」那一組的畫面：資源、團隊頁、校友頁、信件文案。
// 2026-10-15 從 admin/src/ui.js 原樣搬過來（後台拆成四個資料夾）。
// **esc 與 namesOf 是自己的一份**，不從別的資料夾 import。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
//
// 2026-10-19 起畫面上的字全部從 ./strings.js 的字典來（T("鍵")），中英兩版並排在那一支裡。
// 這一支只管拼 HTML，不再寫死任何一句給人看的字。怎麼加一句見 README「後台的中英切換」。
import { T, lang, setLang, withLang, isErr } from "./strings.js";
export { T, lang, setLang };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 一個人在畫面上要顯示的兩個名字（2026-09-10）。**同一份規則在
// passport/src/ui.js 與 availability/src/data.js 也各有一份**
// （資料夾之間不互相 import）。三份漂移的表現是「同一個人在三個地方顯示的名字
// 不一樣」，不會報錯。test/names.test.mjs 拿同一張輸入表逐項比對三份。
export function namesOf(p) {
  const zh = String(p.name_zh || "").trim();
  const en = String(p.name_en || "").trim();
  return {
    name: zh || en || T("common.noName"),
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
// label 與 hint 中英並排（2026-10-19 中英切換），畫的時候 T() 挑一句。
export const GROUPS = [
  { key: "forms",     label: { zh: "申請",     en: "Applications" }, href: "/admin/",           who: "cadre",        hint: { zh: "申請表、審核、簽到、行前信", en: "Forms, review, check-in, notices" } },
  { key: "site",      label: { zh: "對外",     en: "Public site" },  href: "/admin/site/",      who: "cadre",        hint: { zh: "資源、團隊頁、校友頁、信件文案", en: "Resources, team page, alumni page, email copy" } },
  { key: "passports", label: { zh: "護照",     en: "Passports" },    href: "/admin/passports/", who: "intern-staff", hint: { zh: "兩本護照的格子", en: "Boxes in both passports" } },
  { key: "people",    label: { zh: "人與權限", en: "People" },       href: "/admin/people/",    who: "president",    hint: { zh: "邀請碼、職位、team", en: "Invite codes, roles, teams" } },
];
// 側欄上每一行。要加一個新的後台分頁，就在這裡加一行（四份都要加），
// 然後在那一組的 ui.js 加一個畫面函式、main.js 接 data-act="tab" data-t="<key>"。
export const ITEMS = [
  { group: "forms",     key: "home",    label: { zh: "首頁",     en: "Home" },            who: "cadre" },
  { group: "forms",     key: "forms",   label: { zh: "申請表",   en: "Forms" },           who: "cadre" },
  { group: "site",      key: "res",     label: { zh: "資源",     en: "Resources" },       who: "cadre" },
  { group: "site",      key: "team",    label: { zh: "團隊頁",   en: "Team page" },       who: "president" },
  { group: "site",      key: "stories", label: { zh: "校友頁",   en: "Alumni page" },     who: "president" },
  { group: "site",      key: "mail",    label: { zh: "信件文案", en: "Email copy" },      who: "president" },
  { group: "passports", key: "interns", label: { zh: "實習護照", en: "Intern passport" }, who: "intern-staff" },
  { group: "passports", key: "cadre",   label: { zh: "幹部護照", en: "Cadre passport" },  who: "president" },
  { group: "passports", key: "cities",  label: { zh: "城市",     en: "Cities" },          who: "president" },
  { group: "people",    key: "roster",  label: { zh: "幹部名單", en: "Roster" },          who: "president" },
  { group: "people",    key: "invites", label: { zh: "邀請碼",   en: "Invite codes" },    who: "president" },
  { group: "people",    key: "changes", label: { zh: "變動紀錄", en: "Change log" },      who: "president" },
];
const WHY = { president: "why.president", "intern-staff": "why.internStaff" };
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
const BOARD_KEY = { member: "board.member", director: "board.director", president: "board.president" };
export const boardName = board => T(BOARD_KEY[board] || "board.member");

// 側欄。group 是現在在哪一組，tab 是哪一個分頁，counts 是 { <key>: 數字 }（有才顯示，批 2 的首頁會餵）。
// 同一組裡的分頁是 data-act="tab"（不重新載入頁面）；別組的是一般連結，帶 #key 讓那一頁開在對的分頁，
// 也帶 ?lang= 讓語言跟著走（withLang）。
export function railHTML(group, tab, me, counts) {
  const c = counts || {};
  const item = it => {
    const on = it.group === group && it.key === tab;
    const n = c[it.key] ? `<span class="rail-count">${esc(String(c[it.key]))}</span>` : "";
    if (!canSee(it, me)) return `<span class="rail-item off">${esc(T(it.label))}</span>`;
    const href = it.group === group ? `#${it.key}` : withLang(`${GROUPS.find(g => g.key === it.group).href}#${it.key}`);
    return `<a class="rail-item${on ? " on" : ""}" href="${href}"${it.group === group ? ` data-act="tab" data-t="${it.key}"` : ""}${
      on ? ' aria-current="page"' : ""}>${esc(T(it.label))}${n}</a>`;
  };
  const home = ITEMS.find(i => i.key === "home");
  const groups = GROUPS.map(g => {
    const ok = canEnter(g, me);
    const rows = ITEMS.filter(i => i.group === g.key && i.key !== "home");
    return `<div class="rail-group${ok ? "" : " off"}">${esc(T(g.label))}${ok ? "" : `<span class="why">${esc(T(WHY[g.who]) || "")}</span>`}</div>${
      ok ? rows.map(item).join("") : rows.map(i => `<span class="rail-item off">${esc(T(i.label))}</span>`).join("")}`;
  }).join("");
  const teams = String(me && me.team || "").split(/[,、;；]/).map(s => s.trim()).filter(Boolean);
  return `<input class="rail-toggle" type="checkbox" id="rail-toggle" aria-label="${esc(T("rail.open"))}">
  <label class="rail-burger" for="rail-toggle">${T("rail.menu")}</label>
  <nav class="rail" aria-label="${esc(T("rail.groups"))}">
    <div class="rail-me"><b>${esc(me && me.name || "")}</b>
      <span>${esc(boardName(me && me.board))}${teams.length ? "・" + esc(teams.join(T("punct.list"))) : "・" + T("rail.noTeam")}</span></div>
    ${langSwitchHTML()}
    ${item(home)}
    ${groups}
    <div class="rail-foot">${T("rail.foot")}</div>
  </nav>`;
}

// 中英切換（2026-10-19）：兩顆小按鈕，現在的那一顆亮著。字面「中文」「English」刻意不翻，
// 看不懂現在這個語言的人才需要它。main.js 接 data-act="lang"。
export function langSwitchHTML() {
  const b = l => `<button class="lang${lang() === l ? " on" : ""}" data-act="lang" data-lang="${l}" aria-pressed="${lang() === l}">${l === "zh" ? "中文" : "English"}</button>`;
  return `<div class="rail-lang" role="group" aria-label="${esc(T("rail.lang"))}">${b("zh")}${b("en")}</div>`;
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
// 訊息。做成了是綠的，沒做成是橘的。判斷看字典：含有任何一句 err. 開頭的句子就是沒做成（strings.js 的 isErr）。
export function msgKind(msg) {
  const s = String(msg || "");
  if (!s) return "";
  return isErr(s) ? "err" : "ok";
}
export function msgHTML(msg) {
  const k = msgKind(msg);
  if (!k) return "";
  return `<div class="msg ${k}" role="status"><span class="msg-k">${k === "err" ? T("msg.err") : T("msg.ok")}</span><span>${esc(msg)}</span></div>`;
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
export function skeletonHTML() { return `<div class="skeleton" aria-label="${esc(T("loading"))}"><i></i><i></i><i></i></div>`; }

// 舊名字：這一組底下的分頁。側欄用同一份 ITEMS 畫，這一支留給測試與 scripts/mobile-fixtures.mjs。
export function tabsHTML(tab, isPresident) {
  const me = { role: "cadre", board: isPresident ? "president" : "member", team: "Internship Team" };
  return ITEMS.filter(i => i.group === "site" && i.key !== "home" && canSee(i, me))
    .map(i => `<a class="rail-item${i.key === tab ? " on" : ""}" href="#${i.key}" data-act="tab" data-t="${i.key}">${esc(T(i.label))}</a>`).join("");
}


// ═══════════════════════════════════════════════════════════════════════
// 批 5：資源
// ═══════════════════════════════════════════════════════════════════════
// label 是字典的鍵，畫的時候才 T()。
export const RES_KINDS = [
  { v: "pdf", label: "res.pdf" }, { v: "video", label: "res.video" },
  { v: "slides", label: "res.slides" }, { v: "sheet", label: "res.sheet" },
  { v: "book", label: "res.book" }, { v: "link", label: "res.link" },
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
  return pageHead(T("team.title"), T("team.lede", { n: on }))
    + msgHTML(msg)
    + sectionHTML("", `<div class="note">${T("team.note")}</div>
    ${people.length ? `<ul class="flist">${people.map(p => {
      const { name, alt } = namesOf(p);
      return `<li>
        <div class="arow">
          <label class="apick"><input type="checkbox" data-act="approve" data-id="${esc(p.id)}"
            ${p.public_approved ? "checked" : ""}${busy ? " disabled" : ""}
            aria-label="${T("team.approve", { name: esc(name) })}"></label>
          <div class="abody">
            <div class="fhead"><b>${esc(name)}${alt ? `<span class="alt">${esc(alt)}</span>` : ""}</b>
              ${p.public_approved ? `<span class="tag open">${T("team.onPage")}</span>`
                                  : `<span class="tag">${T("team.notYet")}</span>`}</div>
            <div class="fmeta">${esc([p.public_title, p.team].filter(Boolean).join("・") || T("team.noTeam"))}
              ${p.avatar ? T("team.avatar") : T("team.noAvatar")}</div>
          </div>
        </div>
      </li>`;
    }).join("")}</ul>` : emptyHTML(T("team.empty"), T("team.emptyHint"))}`);
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
  return pageHead(T("stories.title"), T("stories.lede", { n: on }))
    + msgHTML(msg)
    + sectionHTML("", `<div class="note">${T("stories.note")}</div>
    ${sorted.length ? `<ul class="flist">${sorted.map(r => `<li>
        <div class="arow">
          <label class="apick"><input type="checkbox" data-act="approve-story" data-id="${esc(r.id)}"
            ${r.story_approved ? "checked" : ""}${busy ? " disabled" : ""}
            aria-label="${T("team.approve", { name: esc(r.name) })}"></label>
          <div class="abody">
            <div class="fhead"><b>${esc(r.name)}</b>
              ${r.story_approved ? `<span class="tag open">${T("team.onPage")}</span>`
                                 : `<span class="tag">${T("stories.waiting")}</span>`}
              ${r.county ? "" : `<span class="tag">${T("stories.noCounty")}</span>`}</div>
            <div class="fmeta">${esc([r.school, r.county].filter(Boolean).join("・"))}
              → ${esc([r.country, r.city, r.place].filter(Boolean).join("・"))}</div>
            <p class="fquote">${esc(r.quote || "")}</p>
            <p class="fmeta">${esc(r.note || "")}</p>
            <div class="fmeta">${r.story_approved
              ? T("stories.approvedAt", { d: esc(String(r.approved_at || "").slice(0, 10)) })
              : T("stories.updatedAt", { d: esc(String(r.updated_at || "").slice(0, 10)) })}</div>
          </div>
        </div>
      </li>`).join("")}</ul>` : emptyHTML(T("stories.empty"), T("stories.emptyHint"))}`);
}

export function resListHTML(items, canEdit, msg, isPresident) {
  const rows = items.map(r => `<li>
    <div class="fhead">
      <b>${esc(r.title)}</b>
      <span class="tag ${r.status === "published" ? "open" : "draft"}">${
        r.status === "published" ? T("res.published") : T("res.draft")}</span>
      <span class="tag">${esc(T((RES_KINDS.find(k => k.v === r.kind) || RES_KINDS[5]).label))}</span>
    </div>
    <div class="fmeta">${esc(r.blurb || T("res.noBlurb"))}</div>
    <div class="fmeta"><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.url)}</a></div>
    ${canEdit ? `<div class="row">
      <button class="btn ghost sm" data-act="res-edit" data-id="${esc(r.id)}">${T("common.edit")}</button>
    </div>` : ""}
  </li>`).join("");

  return pageHead(T("res.title"), T("res.lede"),
      canEdit ? [{ act: "res-new", label: T("res.new"), primary: true }] : [])
    + msgHTML(msg)
    + (canEdit ? "" : `<div class="note">${T("res.readonly")}</div>`)
    + sectionHTML("", items.length ? `<ul class="flist">${rows}</ul>`
      : emptyHTML(T("res.empty"), T("res.emptyHint"),
                  canEdit ? { act: "res-new", label: T("res.new") } : null));
}

export function resEditHTML(r, msg, busy) {
  const cur = r || { title: "", blurb: "", kind: "pdf", url: "", team: "", status: "draft", ord: 100 };
  return pageHead(r ? T("res.editTitle") : T("res.newTitle"), "", [], { act: "res-back", label: T("res.back") })
    + msgHTML(msg)
    + sectionHTML("", `<label><i>${T("res.name")}</i><input id="rtitle" value="${esc(cur.title)}" placeholder="${esc(T("res.namePh"))}"></label>
    <!-- ⚠ 介紹是**搜尋引擎唯一看得到的東西**（連結那一欄要登入才讀得到）。
         所以這一格要寫得像一句對高中生講的話，不是一行檔名。 -->
    <label><i>${T("res.blurb")}</i>
      <textarea id="rblurb" placeholder="${esc(T("res.blurbPh"))}">${esc(cur.blurb || "")}</textarea></label>
    <div class="two">
      <label><i>${T("res.kind")}</i><select id="rkind">
        ${RES_KINDS.map(k => `<option value="${k.v}"${cur.kind === k.v ? " selected" : ""}>${esc(T(k.label))}</option>`).join("")}
      </select></label>
      <label><i>${T("res.ord")}</i><input id="rord" type="number" value="${esc(String(cur.ord))}"></label>
      <label><i>${T("res.team")}</i><input id="rteam" value="${esc(cur.team || "")}"></label>
      <label><i>${T("res.status")}</i><select id="rstatus">
        <option value="draft"${cur.status === "draft" ? " selected" : ""}>${T("res.draftOpt")}</option>
        <option value="published"${cur.status === "published" ? " selected" : ""}>${T("res.publishedOpt")}</option>
      </select></label>
    </div>
    <label><i>${T("res.url")}</i>
      <input id="rurl" value="${esc(cur.url)}" placeholder="https://..."></label>
    <!-- 這一句是人的流程，不是程式。Drive 的分享權限設錯，網站看不出來，
         而使用者看到的是一頁「你需要存取權」。 -->
    <div class="note">${T("res.urlNote")}</div>
    <div class="form-foot">
      <button class="btn" data-act="res-save" ${busy ? "disabled" : ""}>${busy ? T("common.saving") : T("common.save")}</button>
      <button class="btn ghost" data-act="res-back">${T("common.cancel")}</button>
      ${r ? `<span class="sp"></span><button class="btn quiet danger" data-act="res-del" data-id="${esc(r.id)}">${T("common.delete")}</button>` : ""}
    </div>`);
}

// ═══════════════════════════════════════════════════════════════════════
// 信件文案（2026-09-08）
// ═══════════════════════════════════════════════════════════════════════
// label 與 when 是字典的鍵。
export const MAIL_KINDS = [
  { v: "guardian",  label: "mail.guardian",  when: "mail.guardian.when" },
  { v: "interview", label: "mail.interview", when: "mail.interview.when" },
  { v: "accepted",  label: "mail.accepted",  when: "mail.accepted.when" },
  { v: "rejected",  label: "mail.rejected",  when: "mail.rejected.when" },
];
const kindOf = v => MAIL_KINDS.find(k => k.v === v) || MAIL_KINDS[0];

// 系統會自己加在每一封信最後面的那一段。**這裡只是把它顯示出來，不能改。**
// 「不要回覆這封信」是必要資訊不是禮貌用語 —— noreply 沒有 MX，
// 按回覆會被退回，而那個人只會覺得沒有人理他。
// ⚠ 這是真的會寄出去的那一段，信是寄給台灣的學生與家長的，所以**不跟著後台的語言翻**。
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
  return pageHead(T("mail.title"), T("mail.lede"))
    + msgHTML(msg)
    + sectionHTML("", `<ul class="flist">${MAIL_KINDS.map(k => {
      const t = items.find(x => x.kind === k.v);
      return `<li>
        <div class="fhead"><b>${esc(T(k.label))}</b></div>
        <div class="fmeta">${esc(T("mail.whenList", { when: T(k.when) }))}</div>
        <div class="fmeta">${T("mail.subject", { s: esc((t && t.subject) || T("mail.noSubject")) })}</div>
        <div class="row">
          <button class="btn ghost sm" data-act="mail-edit" data-k="${esc(k.v)}">${T("mail.editThis")}</button>
        </div>
      </li>`;
    }).join("")}</ul>`);
}

// 編輯一封信。**左邊改、右邊就是寄出去的樣子。**
// 這一頁的價值在預覽：代換符號打錯不會壞掉，只會空著，
// 而預覽是唯一會當場讓人看到「我把 {姓名} 打成 {名字} 了」的東西。
// 範例的名字與活動名稱、面試那一段加的連結文字，都是信裡真的會出現的中文，不跟著後台的語言翻。
export function mailEditHTML(kind, t, msg, busy) {
  const k = kindOf(kind);
  const NAME = "陳小安", TITLE = "2027 暑期探索營";
  const subject = t ? t.subject : "";
  const body = t ? t.body : "";
  const extra = kind === "interview" ? "\n\n請從這個連結挑一個你方便的時段：\nhttps://cal.com/..." : "";
  return pageHead(esc(T(k.label)), esc(T("mail.editLede", { when: T(k.when) })), [], { act: "mail-back", label: T("mail.back") })
    + msgHTML(msg)
    + `<div class="cols">` + sectionHTML("", `<label><i>${T("mail.subjectLabel")}</i><input id="msub" value="${esc(subject)}"></label>
    <label><i>${T("mail.body")}</i><textarea id="mbody" style="min-height:230px">${esc(body)}</textarea></label>
    <div class="mini" style="margin:-6px 0 14px">
      ${T("mail.vars")}</div>

    <div class="form-foot">
      <button class="btn" data-act="mail-save" data-k="${esc(kind)}" ${busy ? "disabled" : ""}>${
        busy ? T("common.saving") : T("common.save")}</button>
    </div>`)
    + sectionHTML(T("mail.previewTitle"), `<div class="mini" style="margin-bottom:8px">${T("mail.sample", { name: esc(NAME), title: esc(TITLE) })}</div>
    <div class="mailprev"><b>${esc(fillMail(subject, NAME, TITLE)) || T("mail.noSubjectPrev")}</b><pre>${
      esc(fillMail(body, NAME, TITLE) + extra)}</pre><pre class="tail">${esc(mailTail(kind))}</pre></div>
    <div class="mini" style="margin:6px 0 0">
      ${T("mail.tailNote")}</div>`) + `</div>`;
}

// 學員或還沒升級的人走到這裡。**不說「你沒有權限」**：他沒有做錯任何事，只是走錯地方。
export function notCadreHTML() {
  return pageHead(T("notCadre.title"), T("notCadre.lede"), [{ label: T("notCadre.back"), href: "../../app/" }]);
}

export function downHTML() {
  return pageHead(T("down.title"), T("down.lede"), [{ act: "retry", label: T("common.retry") }]);
}
