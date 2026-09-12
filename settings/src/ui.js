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
// BT 的六個 team。**這份清單在 passport/src/ui.js 也有一模一樣的一份**
// （資料夾之間不互相 import，那是這個 repo 的依賴規矩）。
// 兩份漂移的表現是「同一個人在兩個地方屬於不同的 team」——不會報錯，
// 只會讓時間看板的 team 篩選漏掉他。test/teams.test.mjs 逐字比對兩份。
export const TEAMS = ["Curriculum Team", "Mentorship Team", "Marketing Team",
                      "Sponsorship Team", "Internship Team", "Community Relations Team"];

// profiles.team 存的是一串用逗號隔開的 team 名字，例如
// 「Curriculum Team, Marketing Team」。一個人可以在好幾個 team（Paul 2026-09-10）。
//
// **沒有為了這件事開新欄位或跑 migration。** 一個逗號字串在這個規模底下夠用，
// 而多開一欄要動的是：資料表結構、給 anon 的欄位授權、check.sh 的可寫欄位清單、
// 以及每一個讀 team 的地方 —— 換來的好處在三十個人的名單上是零。
//
// **同一份規則在 team/src/ui.js 與 availability/src/ui.js 也各有一份**
// （資料夾之間不互相 import）。test/teams.test.mjs 拿同一張輸入表比對三份。
// 全形逗號與頓號也吃：那是中文輸入法打出來的，而使用者不會知道差別。
export function parseTeams(raw) {
  const out = [];
  for (const part of String(raw || "").split(/[,、;；]/)) {
    const t = part.trim().replace(/\s+/g, " ");
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function formatTeams(list) {
  return parseTeams((list || []).join(",")).join(", ");
}

// 所屬 team 從自由文字改成勾選（2026-09-10）。
// 自由文字**篩不動**：有人打「Curriculum」、有人打「Curriculum Team」、
// 有人打小寫，時間看板的 team 篩選就會變成三個只差一個字的選項，
// 看起來像資料壞掉。
//
// ⚠ **本來就存在、但不在清單裡的值要原樣留著，而且是勾起來的。**
// 直接換成固定的六個勾的話，那個人一按儲存，他填的東西就消失了，
// 而他不會發現 —— 畫面上本來就沒有那一格。
export function teamPickHTML(cur) {
  const picked = parseTeams(cur);
  const extra = picked.filter(t => !TEAMS.includes(t));
  const box = (t, label) => `<label class="check tpick">
    <input type="checkbox" name="team" value="${esc(t)}"${picked.includes(t) ? " checked" : ""}>
    <span>${esc(label)}</span></label>`;
  return `<fieldset class="teams">
    <legend>所屬 team（可以選好幾個）</legend>
    <div class="tgrid">
      ${TEAMS.map(t => box(t, t.replace(/\s*Team$/i, ""))).join("")}
      ${extra.map(t => box(t, t + "（原本填的）")).join("")}
    </div>
  </fieldset>`;
}

// 島上的 16 個起飛點。**這 16 個縣市跟 scripts/taiwan/cities.json 是同一組**
// （test/alumni-story.test.mjs 比對的是兩邊排序後的集合，所以守的是
//  「有沒有多一個或少一個」，**不是順序**。下面這個順序是給人看的，
//  由北到南再繞回東部，改順序不會有任何測試變紅）。
// 填錯或填了表上沒有的縣市，那個人只會**安靜地不出現**在航線圖上，
// 所以這裡是選單不是文字框，資料庫那邊還有一條 check constraint。
export const COUNTIES = ["台北", "桃園", "新竹", "苗栗", "台中", "彰化", "南投",
                         "雲林", "嘉義", "台南", "高雄", "屏東", "宜蘭", "花蓮",
                         "台東", "基隆"];

// 必填的六格加一句話。**英文是選填的** —— /alumni/ 沒有英文就顯示中文那一份。
const STORY_NEED = [
  ["school", "高中"], ["county", "縣市"], ["city", "現在的城市"],
  ["country", "國家"], ["place", "學校或公司"], ["quote", "一句話"], ["note", "介紹"],
];

export function storyMissing(story) {
  const s = story || {};
  return STORY_NEED.filter(([k]) => !String(s[k] || "").trim()).map(([, label]) => label);
}

// 狀態一句話。**「勾了但還沒核可」跟「已經公開」要看得出差別** ——
// 看不出來的話，那個人會以為自己已經在網站上了。
export function storyStatus(story) {
  const s = story || {};
  if (!s.public_story) return "還沒有勾同意，所以這一段只有你自己看得到。";
  if (!s.story_approved) return "已經送出，等 Co-President 核可才會出現在公開的校友頁上。";
  return "已經在公開的校友頁上了。改了那一句話或介紹，會自動下架等重新核可。";
}

// ⚠ **這一頁有三種人，不是兩種**（2026-09-11 修）。
// 原本只有 cadre / 不是 cadre 兩分法，校友於是掉進學員那一條，
// 看到的是「你的名字 / 就讀學校 / 年級」—— 那是問高中生的 ——
// 而存檔那條路在任何故事程式碼之前就被「姓名、學校、年級三個都要填」擋住，
// **校友的故事一個字都存不進去**。畫面對不對跟存不存得起來是同一件事的兩半，
// 所以 ui.js 與 main.js 的分法必須一致：幹部 / 校友 / 學員。
export function settingsHTML(me, msg, busy, story) {
  const cadre = me.role === "cadre";
  const alumni = me.role === "alumni";
  const teller = cadre || alumni;                // 誰有「我的故事」與大頭照
  const v = k => esc(me[k] || "");
  return `<div class="card">
    <h2>設定</h2>
    <div class="sub">${esc(me.email || "")}</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}

    <h3 class="sec-h">我的資料</h3>
    ${teller ? `<div class="two">
      <label><i>中文姓名</i><input id="nzh" value="${v("name_zh")}" autocomplete="name"></label>
      <label><i>英文姓名</i><input id="nen" value="${v("name_en")}" autocomplete="name"></label>
    </div>
    ${cadre ? teamPickHTML(me.team) : ""}`
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

    ${teller ? avatarHTML(me, cadre) : ""}
    ${teller ? storyHTML(me, story) : ""}

    <!-- 2026-09-10：儲存列。Paul 的原話：「下面的存起來現在看起來不像整頁的儲存按鈕，
         比較像大頭照那邊的」——他是對的，它原本就緊貼在大頭照那一塊底下，
         看起來像那一區的按鈕。現在它自己是一條橫跨整張卡片的列，
         上面一條線把它跟上面的內容分開，旁邊一句話說清楚它存的是整頁。 -->
    <div class="saverow">
      <button class="btn" data-act="save" ${busy ? "disabled" : ""}>${busy ? "存檔中…" : "存起來"}</button>
      <span class="savenote">這一頁上面的變更會一起存起來。</span>
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
//
// 校友也有這一區（2026-09-11 修）。理由是他勾的那張同意書上寫著
// 「我同意把我的名字、**大頭照**、高中…放上公開的校友頁」，
// 而公開那一頁的照片拿的正是 profiles.avatar —— 沒有這一區的話，
// 我們對他宣告的公開範圍裡有一個他根本給不了的東西。
//
// 但**說明要跟著分岔**：校友不在幹部的進度牆上，也不在公開團隊頁上，
// 他的照片只會跟著那段故事出現在 /alumni/ 上。同一句話對兩種人不能都成立。
function avatarHTML(me, cadre) {
  const on = !!me.public_profile;
  if (!cadre) {
    return `<h3 class="sec-h">大頭照</h3>
    <div class="avrow">
      <button class="avbtn" data-act="avatar" title="換一張大頭照">${
        me.avatar ? `<img src="${esc(me.avatar)}" alt="">`
                  : `<span>點這裡<br>上傳</span>`}</button>
      <div class="avside">
        這張照片會跟著你下面那段故事一起出現在<b>任何人都看得到的
        <a href="../alumni/">公開校友頁</a></b>上，<b>故事被核可之後</b>才會出現。<br>
        不上傳也沒有關係，那一頁會改用你名字的第一個字。
      </div>
    </div>`;
  }
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

// 「我的故事」。幹部與校友都有，學員沒有（高中生還沒出發）。
//
// 欄位順序**照 /alumni/ 卡片上的順序**：名字、從哪裡、到哪裡、那一句話、介紹。
// 填的時候就看得出成品長什麼樣，不用另外做預覽。
export function storyHTML(me, story) {
  const s = story || {};
  const v = k => esc(s[k] || "");
  const on = !!s.public_story;
  return `<h3 class="sec-h">我的故事</h3>
    <p class="sec-note">填完並且勾同意、Co-President 核可之後，
      你會出現在<a href="../alumni/">公開的校友頁</a>那張航線圖上：
      從你的高中飛到你現在的城市。</p>
    <label><i>公開顯示的名字</i><input id="sname" value="${v("display_name")}"
      placeholder="${esc(me.name_zh || me.name_en || "")}">
      </label>
    <p class="sec-note">想遮字就寫成「張 O 睿」。空著的話用你上面填的姓名。</p>
    <div class="two">
      <label><i>高中</i><input id="sschool" list="schools" value="${v("school")}"
        autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="打兩個字就會跳出來"></label>
      <label><i>高中在哪個縣市</i><select id="scounty">
        <option value="">請選擇</option>
        ${COUNTIES.map(c => `<option${s.county === c ? " selected" : ""}>${esc(c)}</option>`).join("")}
      </select></label>
    </div>
    <p class="sec-note">選了高中之後這一格會自己跳出來。
      新北的高中選「台北」，圖上的起飛點畫在台北。
      高中在澎湖、金門、馬祖的話先寫信給我們，那三個地方還不在圖上。</p>
    <div class="two">
      <label><i>現在的城市</i><input id="scity" value="${v("city")}" placeholder="Vancouver"></label>
      <label><i>國家</i><input id="scountry" value="${v("country")}" placeholder="加拿大"></label>
    </div>
    <label><i>現在念哪間學校或在哪裡工作</i><input id="splace" value="${v("place")}" placeholder="UBC"></label>
    <label><i>你自己的一句話</i><input id="squote" value="${v("quote")}"
      placeholder="現在換我回去講。台下坐的就是三年前的我。"></label>
    <p class="sec-note">這一句在那一頁上用手寫體排出來，是整頁最重要的地方。</p>
    <label><i>一段介紹</i><input id="snote" value="${v("note")}"
      placeholder="兩三句：從哪裡出發、現在在做什麼。"></label>
    <details class="enfold"><summary>英文版（選填）</summary>
      <p class="sec-note">那一頁有中英切換。沒填的話英文版就顯示中文這一份，畫面不會壞。</p>
      <div class="two">
        <label><i>高中（英文）</i><input id="sschoolen" value="${v("school_en")}"></label>
        <label><i>國家（英文）</i><input id="scountryen" value="${v("country_en")}"></label>
      </div>
      <label><i>那一句話（英文）</i><input id="squoteen" value="${v("quote_en")}"></label>
      <label><i>介紹（英文）</i><input id="snoteen" value="${v("note_en")}"></label>
    </details>
    <label class="check">
      <input id="spub" type="checkbox"${on ? " checked" : ""}>
      <span>我同意把我的<b>名字、大頭照、高中、現在的城市與學校、上面那一句話與介紹</b>
        放上<a href="../alumni/">公開的校友頁</a>。那一頁任何人都看得到，也會被搜尋引擎收錄。
        隨時可以把這個勾拿掉，拿掉就會從那一頁消失。</span>
    </label>
    <p class="sec-note">${esc(storyStatus(s))}</p>`;
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

// 存檔失敗的那一句話。**要說得出是哪一半沒存到。**
//
// 「我的資料」與「我的故事」是兩張表、兩句話。前一句成功、後一句失敗的時候，
// 只說「存不起來」是假的：他會以為整頁都沒存到，於是把已經存好的東西再改一次，
// 而真正失敗的那一半他完全不知道。
export function saveFailMessage(profileSaved, err) {
  const why = (err && (err.message || err.code)) || String(err || "");
  return profileSaved
    ? `你的資料存起來了，但「我的故事」那一段沒有存進去：${why}。再按一次「存起來」會重試那一段。`
    : `存不起來：${why}`;
}

export function downHTML() {
  return `<div class="card">
    <h2>資料庫休眠中</h2>
    <div class="wnote big" style="margin-top:16px">現在連不上資料庫。請寄信到 beyondtaiwan2020@gmail.com 請人恢復。</div>
    <div class="row"><button class="btn ghost" data-act="retry">再試一次</button></div>
  </div>`;
}
