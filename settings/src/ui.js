// 設定頁的畫面。**esc 是自己的一份**（資料夾之間不互相依賴）。
//
// ── 這一頁存在的理由 ──
// 2026-09-08 Paul：「要不要公開這個可不可以直接做成一個設定 page，
// 把護照的照片上傳也放到這一頁設定就好」。
//
// **它的價值不只是整齊。** 原本「我的大頭照」要進護照裡面找，
// 而那張照片會出現在公開的團隊頁上 —— **設定的地方跟後果的地方距離太遠**。
// 放在同一個畫面上，勾「我同意公開」的時候旁邊就是那張照片，
// 他看得到自己正在公開什麼。
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const GRADES = ["高一", "高二", "高三", "已畢業", "其他"];

// 幹部與學員看到的東西不一樣，但**是同一頁**。
// 分成兩頁的話，「刪除帳號」「改名字」這種兩邊都有的東西就會有兩份。
export function settingsHTML(me, msg, busy) {
  const cadre = me.role === "cadre";
  const v = k => esc(me[k] || "");
  return `<div class="card">
    <h2>設定</h2>
    <div class="sub">${esc(me.email || "")}</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}

    <h3 class="sec-h">我的資料</h3>
    ${cadre ? `<div class="two">
      <label><i>中文姓名</i><input id="nzh" value="${v("name_zh")}" autocomplete="name"></label>
      <label><i>英文姓名</i><input id="nen" value="${v("name_en")}" autocomplete="name"></label>
    </div>
    <label><i>所屬 team</i><input id="team" value="${v("team")}" placeholder="Curriculum Team"></label>`
    : `<label><i>你的名字</i><input id="nzh" value="${v("name_zh")}" autocomplete="name"></label>
    <div class="two">
      <label><i>就讀學校</i><input id="school" list="schools" value="${v("school")}"
        autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="打兩個字就會跳出來"></label>
      <label><i>年級</i><select id="grade">
        <option value="">請選擇</option>
        ${GRADES.map(g => `<option${me.grade === g ? " selected" : ""}>${esc(g)}</option>`).join("")}
      </select></label>
    </div>
    <datalist id="schools"></datalist>
    <label class="check">
      <input id="nl" type="checkbox"${me.newsletter_opt_in ? " checked" : ""}>
      <span>我願意收 BT 的活動通知與資源更新。每一封都有取消訂閱的連結。</span>
    </label>`}

    ${cadre ? avatarHTML(me) : ""}

    <div class="row">
      <button class="btn" data-act="save" ${busy ? "disabled" : ""}>${busy ? "存檔中…" : "存起來"}</button>
    </div>

    ${cadre ? `<h3 class="sec-h">護照</h3>
    <p class="sec-note">個人標語、蓋章紀錄、心得與照片都在護照裡面。</p>
    <div class="row"><a class="btn ghost sm" href="../passport/">去護照</a></div>` : ""}

    <div class="danger">
      ${cadre
        ? `<p class="sec-note">要離開 BT 的話，帳號的處理是換屆交接的一部分，
             寄信到 <a href="mailto:beyondtaiwan2020@gmail.com">beyondtaiwan2020@gmail.com</a>。</p>`
        : `<button class="btn quiet" data-act="ask-delete">刪除我的帳號與所有資料</button>`}
    </div>
  </div>`;
}

// 大頭照與「要不要公開」**放在同一塊**，理由見檔頭。
function avatarHTML(me) {
  const on = !!me.public_profile;
  return `<h3 class="sec-h">大頭照與公開</h3>
    <div class="avrow">
      <button class="avbtn" data-act="avatar" title="換一張大頭照">${
        me.avatar ? `<img src="${esc(me.avatar)}" alt="">`
                  : `<span>點這裡<br>上傳</span>`}</button>
      <div class="avside">
        這張照片會出現在<b>全體幹部看得到的進度牆</b>上。<br>
        下面那個勾打起來之後，它還會出現在<b>任何人都看得到的公開團隊頁</b>上。
      </div>
    </div>
    <label class="check">
      <input id="pub" type="checkbox"${on ? " checked" : ""}>
      <span>我同意把我的名字、team 與大頭照放上
        <a href="../team/">公開的團隊頁</a>。那一頁任何人都看得到，也會被搜尋引擎收錄。
        不打勾完全沒有關係，也不影響你在 BT 做的任何事。</span>
    </label>
    ${on ? `<label><i>對外顯示的頭銜（選填）</i><input id="ptitle"
      value="${esc(me.public_title || "")}" placeholder="Co-President 2026-2027"></label>
    <p class="sec-note">${me.public_approved
      ? "已經在公開的團隊頁上了。隨時可以把上面那個勾拿掉。"
      : "還要等 Co-President 核可才會真的出現在公開頁面上。"}</p>` : ""}`;
}

// 刪除帳號的確認。**打字確認，不是按兩次。**
// 按兩次擋不住誤按，因為誤按的人第二次也會按。
export function deleteHTML(msg, busy) {
  return `<div class="card">
    <h2>刪除帳號</h2>
    <div class="sub">這個動作沒有辦法復原。</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="wnote big">刪掉的東西包括：你的姓名、學校、年級、訂閱設定，
      以及你送出過的每一份申請與裡面的答案。</div>
    <p class="sec-note">已經寄給你的信不會消失，那些在你自己的信箱裡。
      如果你已經報名了某一場活動，刪掉帳號等於退出那一場。</p>
    <label><i>確定的話，在下面打「刪除」兩個字</i><input id="dc" autocomplete="off"
      autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="刪除"></label>
    <div class="row">
      <button class="btn" data-act="do-delete" ${busy ? "disabled" : ""}>${busy ? "刪除中…" : "永久刪除我的帳號"}</button>
      <button class="btn quiet" data-act="back">先不要</button>
    </div>
  </div>`;
}

export function downHTML() {
  return `<div class="card">
    <h2>資料庫休眠中</h2>
    <div class="wnote big" style="margin-top:16px">現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。</div>
    <div class="row"><button class="btn ghost" data-act="retry">再試一次</button></div>
  </div>`;
}
