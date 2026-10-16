// 後台「護照」那一組的畫面：實習護照的屆別與格子。幹部護照的格子是批 2 的事，到時加在這裡。
// 2026-10-15 從 admin/src/ui.js 原樣搬過來（後台拆成四個資料夾）。
// **esc 是自己的一份**，不從別的資料夾 import。
// 申請管理的畫面。**esc 是自己的一份**，不從別的資料夾 import
//（跟 app/ 與 availability/ 同一條規矩：資料夾之間不互相依賴）。
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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

// 這一組裡面的分頁。實習護照：Internship team 與 Co-President；幹部護照：只有 Co-President
//（Paul 2026-10-15 拍板第 4 題：先只給 Co-President，team 的守門補好再開給 team）。
export function tabsHTML(tab, isPresident) {
  return `<div class="chips" style="margin-bottom:16px">
    <button class="chip wide${tab === "interns" ? " on" : ""}" data-act="tab" data-t="interns">實習護照</button>
    ${isPresident ? `<button class="chip wide${tab === "cadre" ? " on" : ""}" data-act="tab" data-t="cadre">幹部護照</button>` : ""}
  </div>`;
}

// 只有 Internship team 的幹部與 Co-President 進得來。別的幹部看到這一句，不是錯誤畫面。
export function noAccessHTML(me) {
  return `<div class="card">
    ${groupBarHTML("passports", me)}
    <h2>這一組只有 Internship team 用得到</h2>
    <div class="sub">實習護照的格子由 Internship team 的幹部與 Co-President 改。你的 team 不在裡面，所以這一頁對你是關著的。</div>
    <div class="row"><a class="btn ghost" href="../">回後台</a></div>
  </div>`;
}

// 學員或還沒升級的人走到這裡。
// **不說「你沒有權限」**：他沒有做錯任何事，只是走錯地方。
// ═══════════════════════════════════════════════════════════════════════
// 實習護照的後台（2026-10-18）：Internship team 自己改格子、開新的一屆。
// 之前要去 Supabase 的 Table Editor，那等於叫每年換屆的 Director 去碰資料庫。
// 寫入全部走資料庫的函式（門在那裡），這一頁只是表單。
// **每一個動作都要在畫面上有回饋**（Paul 2026-10-17）：按下去變「存檔中…」、
// 成功有一句、失敗說錯在哪、會丟東西的先問一次。
// ═══════════════════════════════════════════════════════════════════════
export const INTERN_CATS = [
  { v: "onboard", label: "入門", hint: "第一個月要做完的" },
  { v: "project", label: "任務", hint: "實際交出去的東西" },
  { v: "reflect", label: "反思", hint: "寫給自己的，只有本人看得到心得" },
];
const internCatOf = v => INTERN_CATS.find(c => c.v === v) || { v, label: v, hint: "" };

// 新格子的代號：T 加屆別的四個數字加流水號。例如 2026-27 的第 10 格是 T2627-10。
// 只是建議值，人可以改。
export function suggestTaskId(termId, tasks) {
  const digits = String(termId || "").replace(/[^0-9]/g, "");
  const prefix = "T" + (digits.slice(2, 4) + digits.slice(-2) || "XX") + "-";
  const used = (tasks || []).filter(t => t.term === termId).length;
  for (let n = used + 1; n < 1000; n++) {
    const id = prefix + String(n).padStart(2, "0");
    if (!(tasks || []).some(t => t.id === id)) return id;
  }
  return prefix + "01";
}

// 主畫面：屆別一區、目前選的那一屆的格子一區。
// data = { terms, tasks, stamped, interns }，sel = 正在看哪一屆的 id。
// isPresident 要傳進來：分頁列上 Co-President 才有的那四個分頁靠它畫。
// 2026-10-18 端對端測試抓到：寫死 false 的話，Co-President 一進實習護照分頁，
// 邀請碼那幾個分頁就不見了，要重新整理才回得去。
export function internAdminHTML(data, sel, msg, busy, isPresident) {
  const terms = data.terms || [];
  const cur = terms.find(t => t.id === sel) || terms.find(t => t.active) || terms[0] || null;
  const tasks = (data.tasks || []).filter(t => cur && t.term === cur.id);
  const dis = busy ? " disabled" : "";
  const termRows = terms.map(t => `<li>
    <div class="fhead"><b>${esc(t.title_zh)}</b>
      <span class="tag">${esc(t.id)}</span>
      ${t.active ? `<span class="tag open">目前這一屆</span>` : ""}
      ${cur && cur.id === t.id ? `<span class="tag">正在看</span>` : ""}</div>
    <div class="fmeta">${esc(t.title_en)}・${esc(String(t.starts_on))} 到 ${esc(String(t.ends_on))}・${
      (data.tasks || []).filter(x => x.term === t.id && x.active).length} 格在用</div>
    <div class="row">
      ${cur && cur.id === t.id ? "" : `<button class="btn ghost sm" data-act="intern-see" data-id="${esc(t.id)}"${dis}>看這一屆的格子</button>`}
      <button class="btn ghost sm" data-act="intern-term-edit" data-id="${esc(t.id)}"${dis}>改標題或日期</button>
      ${t.active ? "" : `<button class="btn ghost sm" data-act="intern-term-activate" data-id="${esc(t.id)}"${dis}>設成目前這一屆</button>`}
    </div>
  </li>`).join("");

  const byCat = INTERN_CATS.map(c => ({ c, rows: tasks.filter(t => t.category === c.v) }))
    .concat([{ c: { v: "?", label: "認不得的分類", hint: "" }, rows: tasks.filter(t => !INTERN_CATS.some(c => c.v === t.category)) }])
    .filter(g => g.rows.length);
  const taskRows = byCat.map(g => `<div class="fmeta" style="margin-top:14px"><b>${esc(g.c.label)}</b>　${esc(g.c.hint)}</div>
    <ul class="flist">${g.rows.map(t => {
      const n = (data.stamped || {})[t.id] || 0;
      return `<li>
      <div class="fhead"><b>${esc(t.title_zh)}</b>
        <span class="tag">${esc(t.id)}</span>
        ${t.active ? "" : `<span class="tag draft">停用中</span>`}
        <span class="tag">${n ? `${n} 人蓋過` : "還沒有人蓋"}</span></div>
      <div class="fmeta">${esc(t.title_en)}${t.description ? "・" + esc(t.description) : ""}・順序 ${esc(String(t.seq))}</div>
      <div class="row">
        <button class="btn ghost sm" data-act="intern-task-edit" data-id="${esc(t.id)}"${dis}>改</button>
        ${t.active
          ? `<button class="btn ghost sm" data-act="intern-task-off" data-id="${esc(t.id)}"${dis}>停用</button>`
          : `<button class="btn ghost sm" data-act="intern-task-on" data-id="${esc(t.id)}"${dis}>恢復</button>`}
        ${n ? "" : `<button class="btn quiet sm" data-act="intern-task-del" data-id="${esc(t.id)}"${dis}>刪掉</button>`}
      </div>
    </li>`; }).join("")}</ul>`).join("");

  return `<div class="card">
    ${tabsHTML("interns", !!isPresident)}
    <h2>實習護照</h2>
    <div class="sub">這一屆的格子、開新的一屆。改完 intern 重新整理護照就看得到。目前 ${data.interns || 0} 位 intern。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="wnote">intern 的章與心得這裡碰不到。蓋過的格子只能停用不能刪：刪了他的章會跟著不見。
      要看誰蓋了什麼，到<a href="../../intern-passport/">實習生進度牆</a>。</div>

    <h3 class="sec-h" style="margin-top:18px">屆別</h3>
    ${terms.length ? `<ul class="flist">${termRows}</ul>` : `<div class="empty">還沒有任何一屆。先開一屆，才能建格子。</div>`}
    <div class="row" style="margin:6px 0 18px"><button class="btn ghost sm" data-act="intern-term-new"${dis}>開新的一屆</button></div>

    <h3 class="sec-h">格子${cur ? `：${esc(cur.title_zh)}` : ""}</h3>
    ${cur ? `<div class="row" style="margin-bottom:6px"><button class="btn" data-act="intern-task-new" data-term="${esc(cur.id)}"${dis}>加一格</button></div>
      ${tasks.length ? taskRows : `<div class="empty">這一屆還沒有格子。</div>`}`
      : `<div class="empty">先開一屆。</div>`}
  </div>`;
}

// 改或開一屆。id 建了就不能改（格子與護照靠它對應），所以改的時候那一格鎖住。
// draft（2026-10-18 端對端測試抓到的）：存檔被擋之後畫面會重畫，沒有 draft 的話
// 剛填的五格全部洗掉，使用者看到一句錯誤訊息跟一張空表單。畫面上的東西要留在畫面上。
export function internTermEditHTML(t, msg, busy, draft) {
  const cur = draft || t || { id: "", title_zh: "", title_en: "", starts_on: "", ends_on: "" };
  const dis = busy ? " disabled" : "";
  return `<div class="card">
    <div class="row" style="margin:0 0 14px"><button class="btn quiet" data-act="intern-back">← 回實習護照</button></div>
    <h2>${t ? "改這一屆" : "開新的一屆"}</h2>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <label><i>代號（英文字母、數字、連字號；建了就不能改）</i>
      <input id="it-id" value="${esc(cur.id)}" placeholder="2027-28"${t ? " disabled" : dis}></label>
    <div class="two">
      <label><i>中文名稱</i><input id="it-zh" value="${esc(cur.title_zh)}" placeholder="2027-28 實習"${dis}></label>
      <label><i>英文名稱（會印在護照上，建議全大寫）</i><input id="it-en" value="${esc(cur.title_en)}" placeholder="INTERNSHIP 2027-28"${dis}></label>
      <label><i>開始日</i><input id="it-start" type="date" value="${esc(String(cur.starts_on || "").slice(0, 10))}"${dis}></label>
      <label><i>結束日</i><input id="it-end" type="date" value="${esc(String(cur.ends_on || "").slice(0, 10))}"${dis}></label>
    </div>
    <div class="wnote">開了之後還不會變成「目前這一屆」，回上一頁按「設成目前這一屆」才會。</div>
    <div class="row">
      <button class="btn" data-act="intern-term-save"${t ? ` data-id="${esc(t.id)}"` : ""}${dis}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="intern-back"${dis}>取消</button>
    </div>
  </div>`;
}

// 改或加一格。id 與屆別建了就不能改。
export function internTaskEditHTML(t, termId, suggestedId, msg, busy, draft) {
  const cur = draft || t || { id: suggestedId || "", term: termId, seq: "", category: "project", title_zh: "", title_en: "", description: "" };
  const dis = busy ? " disabled" : "";
  return `<div class="card">
    <div class="row" style="margin:0 0 14px"><button class="btn quiet" data-act="intern-back">← 回實習護照</button></div>
    <h2>${t ? "改這一格" : "加一格"}</h2>
    <div class="sub">屆別：${esc(cur.term)}</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="two">
      <label><i>代號（建了就不能改，章靠它對到格子）</i>
        <input id="ik-id" value="${esc(cur.id)}"${t ? " disabled" : dis}></label>
      <label><i>分類</i><select id="ik-cat"${dis}>
        ${INTERN_CATS.map(c => `<option value="${c.v}"${cur.category === c.v ? " selected" : ""}>${esc(c.label)}（${esc(c.hint)}）</option>`).join("")}
      </select></label>
      <label><i>中文標題</i><input id="ik-zh" value="${esc(cur.title_zh)}" placeholder="第一個任務" maxlength="30"${dis}></label>
      <label><i>英文標題（會印在章上，全大寫、不要太長）</i><input id="ik-en" value="${esc(cur.title_en)}" placeholder="FIRST TASK" maxlength="30"${dis}></label>
      <label><i>順序（小的在前）</i><input id="ik-seq" type="number" value="${esc(String(cur.seq || ""))}" placeholder="10"${dis}></label>
    </div>
    <label><i>說明（格子正面那一行小字）</i>
      <textarea id="ik-desc" placeholder="做完什麼算完成" maxlength="120"${dis}>${esc(cur.description || "")}</textarea></label>
    <div class="row">
      <button class="btn" data-act="intern-task-save" data-term="${esc(cur.term)}"${t ? ` data-id="${esc(t.id)}"` : ""}${dis}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="intern-back"${dis}>取消</button>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 幹部護照的後台（2026-10-20，批 2）：Co-President 改格子、月份時刻、城市。
// 之前要去 Supabase 的 Table Editor（README「怎麼改活動文案」），那等於叫換屆的人碰資料庫。
// 寫入全部走資料庫的函式（門在那裡），這一頁只是表單。
// 三條不能破的線，畫面與資料庫各擋一次：
//   編號不是輸入框（章靠它對到格子）、蓋過的格子沒有「刪掉」（只有停用）、城市沒有「刪掉」。
// ═══════════════════════════════════════════════════════════════════════
// 跟 passport/src/ui.js 的 CATEGORY 同一組鍵。那邊是給護照本身用的長文案，這裡只要名字。
export const ACT_CATS = [
  { v: "gather", label: "聚會", hint: "全體一起做的事，通常要有人主持" },
  { v: "prompt", label: "題目", hint: "寫給自己的一題，只有本人看得到" },
  { v: "frame",  label: "鏡頭", hint: "一張照片" },
];
const actCatOf = v => ACT_CATS.find(c => c.v === v) || { v, label: v, hint: "" };
// 月份顯示：9 月到隔年 7 月。
export const monthLabel = m => `${m} 月`;

// 主畫面：11 個月各一段（時刻與那個月的格子），最後是城市。
// data = { months, activities, destinations, stamped }。
// 「看它在護照上長什麼樣」（2026-10-16，Paul：改完看不到成品）。
// 用 iframe 把**真的** /passport/ 嵌進來，帶 ?month=N 翻到那一個月。
// 不另外畫一份護照：那會是第二份護照程式碼，改一次要改兩邊，而且畫出來的
// 永遠不會跟真的一模一樣。看到的是登入者自己那本（含自己的章），
// 要看「空白的」就看還沒蓋的格子。previewMonth 是 null 就不畫框。
export function passportPreviewHTML(previewMonth, months) {
  if (previewMonth == null) return "";
  const src = `../../passport/?month=${encodeURIComponent(String(previewMonth))}`;
  return `<div class="preview-wrap" id="passport-preview">
    <div class="fhead" style="margin-bottom:6px"><b>護照預覽：${esc(monthLabel(previewMonth))}</b>
      <span class="mini">這是你自己那本，剛改的格子重新整理預覽就會出現</span>
      <span style="flex:1"></span>
      <button class="btn quiet sm" data-act="preview-reload">重新整理預覽</button>
      <a class="btn quiet sm" href="${src}" target="_blank" rel="noopener">另開視窗</a>
      <button class="btn quiet sm" data-act="preview-close">關掉</button></div>
    <iframe class="preview-frame" src="${src}" title="護照預覽" loading="lazy"></iframe>
  </div>`;
}

export function passportAdminHTML(data, msg, busy, previewMonth) {
  const months = data.months || [];
  const acts = data.activities || [];
  const dis = busy ? " disabled" : "";
  const actRow = a => {
    const n = (data.stamped || {})[a.id] || 0;
    return `<li>
      <div class="fhead"><b>${esc(a.title_zh)}</b>
        <span class="tag">${esc(a.id)}</span>
        <span class="tag">${esc(actCatOf(a.category).label)}</span>
        ${a.active ? "" : `<span class="tag draft">停用中</span>`}
        <span class="tag">${n ? `${n} 人蓋過` : "還沒有人蓋"}</span>
        ${a.needs_host ? `<span class="tag">要主持人</span>` : ""}
        ${a.callback_to ? `<span class="tag">回望 ${esc(a.callback_to)}</span>` : ""}</div>
      <div class="fmeta">${esc(a.title_en)}${a.description ? "・" + esc(a.description) : ""}</div>
      <div class="row">
        <button class="btn ghost sm" data-act="act-edit" data-id="${esc(a.id)}"${dis}>改</button>
        ${a.active
          ? `<button class="btn ghost sm" data-act="act-off" data-id="${esc(a.id)}"${dis}>停用</button>`
          : `<button class="btn ghost sm" data-act="act-on" data-id="${esc(a.id)}"${dis}>恢復</button>`}
        ${n ? "" : `<button class="btn quiet sm" data-act="act-del" data-id="${esc(a.id)}"${dis}>刪掉</button>`}
      </div>
    </li>`;
  };
  const monthBlocks = months.map(m => {
    const rows = acts.filter(a => a.month === m.month);
    return `<h3 class="sec-h">${esc(monthLabel(m.month))}
      <span class="mini" style="font-weight:400;margin-left:8px">右上角的時刻：${m.theme_zh ? esc(m.theme_zh) : "（空）"}</span>
      <button class="btn quiet sm" data-act="month-edit" data-seq="${esc(String(m.seq))}"${dis}>改時刻</button>
      <button class="btn quiet sm" data-act="preview" data-month="${esc(String(m.month))}">看它在護照上長什麼樣</button></h3>
      ${rows.length ? `<ul class="flist">${rows.map(actRow).join("")}</ul>` : `<div class="empty sm">這個月還沒有格子。</div>`}
      <div class="row" style="margin:4px 0 10px"><button class="btn ghost sm" data-act="act-new" data-month="${esc(String(m.month))}"${dis}>在 ${esc(monthLabel(m.month))}加一格</button></div>`;
  }).join("");
  const dests = data.destinations || [];
  const destRows = dests.map(d => `<li>
    <div class="fhead"><b>${esc(d.city)}</b><span class="tag">${esc(d.code)}</span>
      ${d.active ? "" : `<span class="tag draft">停用中</span>`}</div>
    <div class="row">
      <button class="btn ghost sm" data-act="dest-edit" data-code="${esc(d.code)}"${dis}>改名字</button>
      ${d.active
        ? `<button class="btn ghost sm" data-act="dest-off" data-code="${esc(d.code)}"${dis}>停用</button>`
        : `<button class="btn ghost sm" data-act="dest-on" data-code="${esc(d.code)}"${dis}>恢復</button>`}
    </div>
  </li>`).join("");

  return `<div class="card">
    ${tabsHTML("cadre", true)}
    <h2>幹部護照</h2>
    <div class="sub">33 格的題目與說明、每個月右上角的時刻、入境章抽得到的城市。改完幹部重新整理護照就看得到。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="wnote">幹部的章、心得、照片這裡碰不到。<b>編號不能改</b>（章靠它對到格子），蓋過的格子只能停用不能刪，城市只能停用不能刪。
      ${months.length ? "" : "月份載不到的話，格子也不會出現。"}</div>
    ${passportPreviewHTML(previewMonth, months)}
    ${months.length ? monthBlocks : `<div class="empty">月份還沒載到。</div>`}
    <h3 class="sec-h" style="margin-top:26px">城市（入境章抽城市用的）</h3>
    <div class="mini" style="margin-bottom:8px">有人抽到過的城市資料庫擋著不給刪，所以這裡只有停用。停用之後新的入境章不會再抽到它，已經發出去的不動。</div>
    ${dests.length ? `<ul class="flist">${destRows}</ul>` : `<div class="empty sm">還沒有城市。</div>`}
    <div class="row" style="margin:6px 0 4px"><button class="btn ghost sm" data-act="dest-new"${dis}>加一個城市</button></div>
  </div>`;
}

// 改或加一格。編號是標籤不是輸入框；改既有的格子時月份也鎖住。
// draft：存檔被擋之後畫面會重畫，沒有 draft 的話剛填的東西全部洗掉（實習護照那邊 2026-10-18 抓過同一件事）。
export function activityEditHTML(a, month, months, msg, busy, draft) {
  const cur = draft || a || { id: "", month, category: "gather", title_zh: "", title_en: "", description: "", needs_host: false, callback_to: "" };
  const dis = busy ? " disabled" : "";
  const lock = a ? " disabled" : dis;
  return `<div class="card">
    <div class="row" style="margin:0 0 14px"><button class="btn quiet" data-act="cadre-back">← 回幹部護照</button></div>
    <h2>${a ? "改這一格" : "加一格"}</h2>
    <div class="sub">${a ? `編號 <b>${esc(a.id)}</b>（不能改，章靠它對到格子）` : "編號由系統照月份算，存了之後就不能改。"}</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="two">
      <label><i>月份${a ? "（建了就不能換）" : ""}</i><select id="ak-month"${lock}>
        ${(months || []).map(m => `<option value="${esc(String(m.month))}"${String(cur.month) === String(m.month) ? " selected" : ""}>${esc(monthLabel(m.month))}</option>`).join("")}
      </select></label>
      <label><i>分類</i><select id="ak-cat"${dis}>
        ${ACT_CATS.map(c => `<option value="${c.v}"${cur.category === c.v ? " selected" : ""}>${esc(c.label)}（${esc(c.hint)}）</option>`).join("")}
      </select></label>
      <label><i>中文標題</i><input id="ak-zh" value="${esc(cur.title_zh)}" placeholder="開學電影夜" maxlength="30"${dis}></label>
      <label><i>英文標題（會印在章上，全大寫、不要太長）</i><input id="ak-en" value="${esc(cur.title_en)}" placeholder="OPENING NIGHT" maxlength="30"${dis}></label>
    </div>
    <label><i>說明（格子正面那一行小字）</i>
      <textarea id="ak-desc" placeholder="做什麼算完成" maxlength="200"${dis}>${esc(cur.description || "")}</textarea></label>
    <div class="two">
      <label class="check" style="display:flex;gap:10px;align-items:center;font-size:14.5px">
        <input id="ak-host" type="checkbox" style="width:18px;height:18px"${cur.needs_host ? " checked" : ""}${dis}>
        <span>這一格要有人主持（聚會通常要）</span></label>
      <label><i>回望哪一格（選填，例如 09B；打開這一格時會把那一格的心得拉回來）</i>
        <input id="ak-cb" value="${esc(cur.callback_to || "")}" placeholder="09B" maxlength="4"${dis}></label>
    </div>
    <div class="row">
      <button class="btn" data-act="act-save"${a ? ` data-id="${esc(a.id)}"` : ""}${dis}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="cadre-back"${dis}>取消</button>
    </div>
  </div>`;
}

// 改一個月右上角的時刻。seq 與月份不給改，只有那一串字。
export function monthEditHTML(m, msg, busy, draft) {
  const cur = draft || m || { seq: "", month: "", theme_zh: "", theme_en: "" };
  const dis = busy ? " disabled" : "";
  return `<div class="card">
    <div class="row" style="margin:0 0 14px"><button class="btn quiet" data-act="cadre-back">← 回幹部護照</button></div>
    <h2>${esc(monthLabel(cur.month))}的時刻</h2>
    <div class="sub">月份頁右上角那一小串字。留空就不顯示。刻意不整點的時刻（08:40、23:50）是內容決定，不是打字錯誤。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="two">
      <label><i>時刻</i><input id="mk-zh" value="${esc(cur.theme_zh || "")}" placeholder="07:00" maxlength="20"${dis}></label>
      <label><i>英文副標（現在的版面不顯示，留空就好）</i><input id="mk-en" value="${esc(cur.theme_en || "")}" maxlength="40"${dis}></label>
    </div>
    <div class="row">
      <button class="btn" data-act="month-save" data-seq="${esc(String(cur.seq))}"${dis}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="cadre-back"${dis}>取消</button>
    </div>
  </div>`;
}

// 加一個城市或改名字。代碼建了就不能改（visas 靠它）。
export function destinationEditHTML(d, msg, busy, draft) {
  const cur = draft || d || { code: "", city: "", active: true };
  const dis = busy ? " disabled" : "";
  return `<div class="card">
    <div class="row" style="margin:0 0 14px"><button class="btn quiet" data-act="cadre-back">← 回幹部護照</button></div>
    <h2>${d ? "改這個城市的名字" : "加一個城市"}</h2>
    <div class="sub">入境章會印這個名字，建議全大寫英文。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="two">
      <label><i>代碼（2 到 8 個英文或數字，建議用機場代碼${d ? "；建了就不能改" : ""}）</i>
        <input id="dk-code" value="${esc(cur.code)}" placeholder="TPE" maxlength="8"${d ? " disabled" : dis}></label>
      <label><i>城市名字</i><input id="dk-city" value="${esc(cur.city)}" placeholder="TAIPEI" maxlength="40"${dis}></label>
    </div>
    <div class="row">
      <button class="btn" data-act="dest-save"${d ? ` data-code="${esc(d.code)}"` : ""} data-active="${cur.active === false ? "0" : "1"}"${dis}>${busy ? "存檔中…" : "存起來"}</button>
      <button class="btn ghost" data-act="cadre-back"${dis}>取消</button>
    </div>
  </div>`;
}

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
