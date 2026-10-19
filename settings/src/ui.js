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
//
// 2026-10-19 起畫面上的字全部從 ./strings.js 的字典來（T("鍵")），中英兩版並排在那一支裡。
// 這一頁也是中英切換鈕的家（langSwitchHTML，在「我的資料」上面），其他登入後的頁面跟著這裡選的走。
import { T, lang, setLang } from "./strings.js";
export { T, lang, setLang };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 年級。**值存在資料庫裡是中文**（高一、高二…），英文只是畫面上的顯示，存的還是這幾個字。
export const GRADES = ["高一", "高二", "高三", "已畢業", "其他"];
export const gradeLabel = g => (GRADES.includes(g) ? T("grade." + g) : g);

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
//
// 2026-10-21（後台重整批 3，Paul 2026-10-15 拍板第 2 題）：team 決定後台的權限，所以
//   - Director 與 Co-President 的 team 鎖住，只有 Co-President 在後台改（locked = true，整塊變成唯讀）。
//   - 一般幹部仍然自己勾，但「會長出權限的 team」（privileged，現在只有 Internship Team）
//     沒勾的那一格關掉，要 Co-President 加。本來就在裡面的照樣勾著、也退得出來。
// 畫面上關掉只是提醒；真正的門是資料庫上的 trigger（2026-10-21-people-admin.sql），
// 硬改也存不進去，會看到「要 Co-President 改」那一句。
export function teamLocked(me) {
  return !!me && me.role === "cadre" && (me.board_role === "director" || me.board_role === "president");
}
export function teamPickHTML(cur, locked, privileged) {
  const picked = parseTeams(cur);
  const extra = picked.filter(t => !TEAMS.includes(t));
  const priv = privileged || [];
  if (locked) {
    return `<fieldset class="teams">
      <legend>${T("team.legend")}</legend>
      <div class="tgrid"><span>${picked.length ? esc(picked.join(T("punct.list"))) : T("team.none")}</span></div>
      <div class="mini">${T("team.lockedNote")}</div>
    </fieldset>`;
  }
  const box = (t, label) => {
    const lock = priv.includes(t) && !picked.includes(t);
    return `<label class="check tpick">
    <input type="checkbox" name="team" value="${esc(t)}"${picked.includes(t) ? " checked" : ""}${lock ? " disabled" : ""}>
    <span>${esc(label)}${lock ? T("team.needPres") : ""}</span></label>`;
  };
  return `<fieldset class="teams">
    <legend>${T("team.legendMulti")}</legend>
    <div class="tgrid">
      ${TEAMS.map(t => box(t, t.replace(/\s*Team$/i, ""))).join("")}
      ${extra.map(t => box(t, t + T("team.original"))).join("")}
    </div>
  </fieldset>`;
}

// 島上的 16 個起飛點。**這 16 個縣市跟 scripts/taiwan/cities.json 是同一組**
// （test/alumni-story.test.mjs 比對的是兩邊排序後的集合，所以守的是
//  「有沒有多一個或少一個」，**不是順序**。下面這個順序是給人看的，
//  由北到南再繞回東部，改順序不會有任何測試變紅）。
// 填錯或填了表上沒有的縣市，那個人只會**安靜地不出現**在航線圖上，
// 所以這裡是選單不是文字框，資料庫那邊還有一條 check constraint。
// 縣市名是資料（存進資料庫、畫在圖上），不翻。
export const COUNTIES = ["台北", "桃園", "新竹", "苗栗", "台中", "彰化", "南投",
                         "雲林", "嘉義", "台南", "高雄", "屏東", "宜蘭", "花蓮",
                         "台東", "基隆"];

// 必填的六格加一句話。**英文是選填的** —— /alumni/ 沒有英文就顯示中文那一份。
const STORY_NEED = [
  ["school", "story.school"], ["county", "story.county"], ["city", "story.city"],
  ["country", "story.country"], ["place", "story.place"], ["quote", "story.quote"], ["note", "story.note"],
];

export function storyMissing(story) {
  const s = story || {};
  return STORY_NEED.filter(([k]) => !String(s[k] || "").trim()).map(([, key]) => T(key));
}

// 狀態一句話。**「勾了但還沒核可」跟「已經公開」要看得出差別** ——
// 看不出來的話，那個人會以為自己已經在網站上了。
export function storyStatus(story) {
  const s = story || {};
  if (!s.public_story) return T("story.st.private");
  if (!s.story_approved) return T("story.st.pending");
  return T("story.st.live");
}

// 中英切換（2026-10-19）：兩顆小按鈕，現在的那一顆亮著。字面「中文」「English」刻意不翻。
// main.js 接 data-act="lang"。
export function langSwitchHTML() {
  const b = l => `<button class="lang${lang() === l ? " on" : ""}" data-act="lang" data-lang="${l}" aria-pressed="${lang() === l}">${l === "zh" ? "中文" : "English"}</button>`;
  return `<div class="langrow" role="group" aria-label="${esc(T("lang.label"))}"><span class="langlbl">${T("lang.label")}</span>${b("zh")}${b("en")}</div>`;
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
  // 2026-10-17：第四種人，實習生。名字兩格、大頭照（進度牆要用）、沒有故事、可以刪帳號。
  const intern = me.role === "intern";
  const teller = cadre || alumni;                // 誰有「我的故事」
  const named = teller || intern;                // 誰的「我的資料」是中英文名兩格
  const v = k => esc(me[k] || "");
  return `<div class="card">
    <h2>${T("s.title")}</h2>
    <div class="sub">${esc(me.email || "")}</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}

    ${langSwitchHTML()}
    <h3 class="sec-h">${T("s.me")}</h3>
    ${named ? `<div class="two">
      <label><i>${T("s.nameZh")}</i><input id="nzh" value="${v("name_zh")}" autocomplete="name"></label>
      <label><i>${T("s.nameEn")}</i><input id="nen" value="${v("name_en")}" autocomplete="name"></label>
    </div>
    ${cadre ? teamPickHTML(me.team, teamLocked(me), me.privileged_teams) : ""}`
    : `<label><i>${T("s.name")}</i><input id="nzh" value="${v("name_zh")}" autocomplete="name"></label>
    <div class="two">
      <label><i>${T("s.school")}</i><input id="school" list="schools" value="${v("school")}"
        autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="${esc(T("s.schoolPh"))}"></label>
      <label><i>${T("s.grade")}</i><select id="grade">
        <option value="">${T("s.pick")}</option>
        ${GRADES.map(g => `<option value="${esc(g)}"${me.grade === g ? " selected" : ""}>${esc(gradeLabel(g))}</option>`).join("")}
      </select></label>
    </div>
    <datalist id="schools"></datalist>
    <label class="check">
      <input id="nl" type="checkbox"${me.newsletter_opt_in ? " checked" : ""}>
      <span>${T("s.newsletter")}</span>
    </label>`}

    ${named ? avatarHTML(me, cadre, intern) : ""}
    ${teller ? storyHTML(me, story) : ""}

    <!-- 2026-09-10：儲存列。Paul 的原話：「下面的存起來現在看起來不像整頁的儲存按鈕，
         比較像大頭照那邊的」——他是對的，它原本就緊貼在大頭照那一塊底下，
         看起來像那一區的按鈕。現在它自己是一條橫跨整張卡片的列，
         上面一條線把它跟上面的內容分開，旁邊一句話說清楚它存的是整頁。 -->
    <div class="saverow">
      <button class="btn" data-act="save" ${busy ? "disabled" : ""}>${busy ? T("common.saving") : T("s.save")}</button>
      <span class="savenote">${T("s.saveNote")}</span>
    </div>

    ${cadre ? `<h3 class="sec-h">${T("s.passport")}</h3>
    <p class="sec-note">${T("s.passportNote")}</p>
    <div class="row"><a class="btn ghost sm" href="../passport/">${T("s.goPassport")}</a>${
      // Internship team 的幹部與 Co-President 多一顆：實習生的進度牆。
      // 入口放這裡不放頂欄，因為頂欄不准依 team 過濾（shared/nav.js 檔頭）。
      internshipStaff(me) ? `<a class="btn ghost sm" href="../intern-passport/">${T("s.internWall")}</a>` : ""}</div>` : ""}
    ${intern ? `<h3 class="sec-h">${T("s.internPassport")}</h3>
    <p class="sec-note">${T("s.internNote")}</p>
    <div class="row"><a class="btn ghost sm" href="../intern-passport/">${T("s.goIntern")}</a></div>` : ""}

    <div class="danger">
      ${cadre
        ? `<p class="sec-note">${T("s.leave")}</p>`
        : `<button class="btn quiet" data-act="ask-delete">${T("s.delete")}</button>`}
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
// 誰看得到實習生進度牆：Internship team 的幹部與 Co-President（跟資料庫的 is_internship_team() 同一條規則）。
export function internshipStaff(me) {
  return me.role === "cadre" &&
    (me.board_role === "president" || parseTeams(me.team).includes("Internship Team"));
}

function avatarHTML(me, cadre, intern) {
  const on = !!me.public_profile;
  const btn = `<button class="avbtn" data-act="avatar" title="${esc(T("av.change"))}">${
        me.avatar ? `<img src="${esc(me.avatar)}" alt="">`
                  : `<span>${T("av.upload")}</span>`}</button>`;
  if (intern) {
    return `<h3 class="sec-h">${T("av.title")}</h3>
    <div class="avrow">
      ${btn}
      <div class="avside">
        ${T("av.intern")}
      </div>
    </div>`;
  }
  if (!cadre) {
    return `<h3 class="sec-h">${T("av.title")}</h3>
    <div class="avrow">
      ${btn}
      <div class="avside">
        ${T("av.alumni")}
      </div>
    </div>`;
  }
  return `<h3 class="sec-h">${T("av.titleCadre")}</h3>
    <div class="avrow">
      ${btn}
      <div class="avside">
        ${T("av.cadre")}
      </div>
    </div>
    <label class="check">
      <input id="pub" type="checkbox"${on ? " checked" : ""}>
      <span>${T("av.consent")}</span>
    </label>
    ${on ? `<label><i>${T("av.ptitle")}</i><input id="ptitle"
      value="${esc(me.public_title || "")}" placeholder="Co-President 2026-2027"></label>
    <p class="sec-note">${me.public_approved ? T("av.approved") : T("av.pending")}</p>` : ""}`;
}

// 「我的故事」。幹部與校友都有，學員沒有（高中生還沒出發）。
//
// 欄位順序**照 /alumni/ 卡片上的順序**：名字、從哪裡、到哪裡、那一句話、介紹。
// 填的時候就看得出成品長什麼樣，不用另外做預覽。
export function storyHTML(me, story) {
  const s = story || {};
  const v = k => esc(s[k] || "");
  const on = !!s.public_story;
  return `<h3 class="sec-h">${T("st.title")}</h3>
    <p class="sec-note">${T("st.lede")}</p>
    <label><i>${T("st.name")}</i><input id="sname" value="${v("display_name")}"
      placeholder="${esc(me.name_zh || me.name_en || "")}">
      </label>
    <p class="sec-note">${T("st.nameNote")}</p>
    <div class="two">
      <label><i>${T("st.school")}</i><input id="sschool" list="schools" value="${v("school")}"
        autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="${esc(T("s.schoolPh"))}"></label>
      <label><i>${T("st.county")}</i><select id="scounty">
        <option value="">${T("s.pick")}</option>
        ${COUNTIES.map(c => `<option${s.county === c ? " selected" : ""}>${esc(c)}</option>`).join("")}
      </select></label>
    </div>
    <p class="sec-note">${T("st.countyNote")}</p>
    <div class="two">
      <label><i>${T("st.city")}</i><input id="scity" value="${v("city")}" placeholder="Vancouver"></label>
      <label><i>${T("st.country")}</i><input id="scountry" value="${v("country")}" placeholder="${esc(T("st.countryPh"))}"></label>
    </div>
    <label><i>${T("st.place")}</i><input id="splace" value="${v("place")}" placeholder="UBC"></label>
    <label><i>${T("st.quote")}</i><input id="squote" value="${v("quote")}"
      placeholder="${esc(T("st.quotePh"))}"></label>
    <p class="sec-note">${T("st.quoteNote")}</p>
    <label><i>${T("st.note")}</i><input id="snote" value="${v("note")}"
      placeholder="${esc(T("st.notePh"))}"></label>
    <details class="enfold"><summary>${T("st.en")}</summary>
      <p class="sec-note">${T("st.enNote")}</p>
      <div class="two">
        <label><i>${T("st.schoolEn")}</i><input id="sschoolen" value="${v("school_en")}"></label>
        <label><i>${T("st.countryEn")}</i><input id="scountryen" value="${v("country_en")}"></label>
      </div>
      <label><i>${T("st.quoteEn")}</i><input id="squoteen" value="${v("quote_en")}"></label>
      <label><i>${T("st.noteEn")}</i><input id="snoteen" value="${v("note_en")}"></label>
    </details>
    <label class="check">
      <input id="spub" type="checkbox"${on ? " checked" : ""}>
      <span>${T("st.consent")}</span>
    </label>
    <p class="sec-note">${esc(storyStatus(s))}</p>`;
}

// 刪除帳號的確認。**打字確認，不是按兩次。**
// 按兩次擋不住誤按，因為誤按的人第二次也會按。
// 打「刪除」或「delete」都算（2026-10-19 英文版加的，中文那條不變）。
export const DELETE_WORDS = ["刪除", "delete"];
export const typedDelete = v => DELETE_WORDS.includes(String(v || "").trim().toLowerCase());
export function deleteHTML(msg, busy) {
  return `<div class="card">
    <h2>${T("del.title")}</h2>
    <div class="sub">${T("del.sub")}</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    <div class="wnote big">${T("del.what")}</div>
    <p class="sec-note">${T("del.mail")}</p>
    <label><i>${T("del.type")}</i><input id="dc" autocomplete="off"
      autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${esc(T("del.typePh"))}"></label>
    <div class="row">
      <button class="btn" data-act="do-delete" ${busy ? "disabled" : ""}>${busy ? T("del.deleting") : T("del.do")}</button>
      <button class="btn quiet" data-act="back">${T("del.no")}</button>
    </div>
  </div>`;
}

// 存檔失敗的那一句話。**要說得出是哪一半沒存到。**
//
// 「我的資料」與「我的故事」是兩張表、兩句話。前一句成功、後一句失敗的時候，
// 只說「存不起來」是假的：他會以為整頁都沒存到，於是把已經存好的東西再改一次，
// 而真正失敗的那一半他完全不知道。
// 資料庫那條守 team 的 trigger 丟出來的兩個代碼翻成人話（2026-10-21）。
const SAYS = [
  ["team_locked", "sf.teamLocked"],
  ["team_needs_president", "sf.teamNeedsPres"],
];
export function saveFailMessage(profileSaved, err) {
  let why = (err && (err.message || err.code)) || String(err || "");
  for (const [code, key] of SAYS) if (why.includes(code)) { why = T(key); break; }
  return profileSaved ? T("sf.half", { why }) : T("err.save", { why });
}

export function downHTML() {
  return `<div class="card">
    <h2>${T("down.title")}</h2>
    <div class="wnote big" style="margin-top:16px">${T("down.lede")}</div>
    <div class="row"><button class="btn ghost" data-act="retry">${T("common.retry")}</button></div>
  </div>`;
}
