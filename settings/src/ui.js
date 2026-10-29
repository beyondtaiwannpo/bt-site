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
// 2026-10-24（權限重新設計，Paul 10-23 第 3 題）：team 從此**只是標籤**（時間看板篩選、團隊頁分組），
// 不長出任何權限，所以每個人又自己勾得了任何 team，10-21 那條鎖住 Director 的 trigger 拆掉了。
// 後台的權限看「指派」（/admin/people/ 的工作區那一頁），跟這裡勾什麼無關。
export function teamPickHTML(cur) {
  const picked = parseTeams(cur);
  const extra = picked.filter(t => !TEAMS.includes(t));
  const box = (t, label) => `<label class="check tpick">
    <input type="checkbox" name="team" value="${esc(t)}"${picked.includes(t) ? " checked" : ""}>
    <span>${esc(label)}</span></label>`;
  return `<fieldset class="teams">
    <legend>${T("team.legendMulti")}</legend>
    <div class="tgrid">
      ${TEAMS.map(t => box(t, t.replace(/\s*Team$/i, ""))).join("")}
      ${extra.map(t => box(t, t + T("team.original"))).join("")}
    </div>
    <div class="mini">${T("team.labelNote")}</div>
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
// 校友的歡迎卡（2026-11-07）。只給校友；故事還沒填或還沒勾同意才出現；按掉過（profiles.alumni_welcome_dismissed_at 有值）就不再出現。
// 故事一勾同意，卡就自己不見，不用按。
export function showWelcome(me, story) {
  if (!me || me.role !== "alumni") return false;
  if (me.alumni_welcome_dismissed_at) return false;
  return !(story && story.public_story);
}
export function welcomeHTML(me, story) {
  if (!showWelcome(me, story)) return "";
  return `<div class="welcome" role="region" aria-label="${esc(T("w.title"))}">
    <h3>${T("w.title")}</h3>
    <p>${T("w.lede")}</p>
    <ol>
      <li>${T("w.story")}</li>
      <li>${T("w.events")}</li>
      <li>${T("w.contact")}</li>
    </ol>
    <div class="row"><button class="btn ghost sm" data-act="welcome-dismiss">${T("w.dismiss")}</button></div>
  </div>`;
}
export function settingsHTML(me, msg, busy, story) {
  const cadre = me.role === "cadre";
  const alumni = me.role === "alumni";
  // 2026-10-17：第四種人，實習生。名字兩格、大頭照（進度牆要用）、沒有故事、可以刪帳號。
  const intern = me.role === "intern";
  const teller = cadre || alumni;                // 誰有「我的故事」
  const named = teller || intern;                // 誰的「我的資料」是中英文名兩格
  const v = k => esc(me[k] || "");
  // 2026-11-06 自動儲存：整頁那顆「存起來」拿掉了，改成兩個各自會存的區塊。
  //   - data-autosave="profile"：「我的資料」加大頭照那一區的公開勾選（存進 profiles）。
  //   - data-autosave="story"：「我的故事」（存進 alumni_stories，另一張表，另一個請求）。
  // 分成兩個容器的理由：改一個名字不該連故事那張表也送一次。大頭照上傳與刪帳號仍然是按鈕
  //（上傳是「丟東西」、刪帳號是不可逆的）。busy 這個參數留著不用，呼叫的地方與測試都還傳它。
  return `<div class="card">
    <h2>${T("s.title")}</h2>
    <div class="sub">${esc(me.email || "")}</div>
    ${msg ? `<div class="wnote big">${esc(msg)}</div>` : ""}
    ${welcomeHTML(me, story)}

    ${langSwitchHTML()}
    <div data-autosave="profile" data-id="${esc(me.id || "")}">
    <h3 class="sec-h">${T("s.me")}</h3>
    ${named ? `<div class="two">
      <label><i>${T("s.nameZh")}</i><input id="nzh" name="name_zh" value="${v("name_zh")}" autocomplete="name"></label>
      <label><i>${T("s.nameEn")}</i><input id="nen" name="name_en" value="${v("name_en")}" autocomplete="name"></label>
    </div>
    ${cadre ? teamPickHTML(me.team) : ""}`
    : `<label><i>${T("s.name")}</i><input id="nzh" name="name_zh" value="${v("name_zh")}" autocomplete="name"></label>
    <div class="two">
      <label><i>${T("s.school")}</i><input id="school" name="school" list="schools" value="${v("school")}"
        autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="${esc(T("s.schoolPh"))}"></label>
      <label><i>${T("s.grade")}</i><select id="grade" name="grade">
        <option value="">${T("s.pick")}</option>
        ${GRADES.map(g => `<option value="${esc(g)}"${me.grade === g ? " selected" : ""}>${esc(gradeLabel(g))}</option>`).join("")}
      </select></label>
    </div>
    <datalist id="schools"></datalist>
    <label class="check">
      <input id="nl" name="newsletter_opt_in" type="checkbox"${me.newsletter_opt_in ? " checked" : ""}>
      <span>${T("s.newsletter")}</span>
    </label>`}

    ${named ? avatarHTML(me, cadre, intern) : ""}
    <div class="autorow">${autosaveHint("profile")}<span class="savenote">${T("s.autoNote")}</span></div>
    </div>
    ${teller ? `<div data-autosave="story" data-id="${esc(me.id || "")}">${storyHTML(me, story)}
    <div class="autorow">${autosaveHint("story")}</div>
    </div>` : ""}

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
// 誰看得到實習生進度牆（2026-10-24 起看指派）：被派進 intern-passport 工作區的幹部，
// 以及 Co-President 與 Senior Adviser。me.ws 是 my_access() 回的 { 工作區: 等級 }，跟資料庫的 is_internship_team() 同一條規則。
export function internshipStaff(me) {
  return me.role === "cadre" &&
    (me.board_role === "president" || me.board_role === "senior_adviser" || !!((me.ws || {})["intern-passport"]));
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
      <input id="pub" name="public_profile" type="checkbox"${on ? " checked" : ""}>
      <span>${T("av.consent")}</span>
    </label>
    <p class="sec-note" data-pub-note>${pubNote(me)}</p>`;
}

// 公開勾選底下那兩句（頭銜、核可了沒）。2026-11-06 起勾了就自動存、不重畫整頁，
// 所以這一段獨立出來，存好之後 main.js 只換這一段的字（data-pub-note）。沒勾就是空字串。
export function pubNote(me) {
  if (!me.public_profile) return "";
  return `${me.title ? T("av.titleIs", { title: esc(me.title) }) : T("av.noTitle")}<br>${me.public_approved ? T("av.approved") : T("av.pending")}`;
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
    <label><i>${T("st.name")}</i><input id="sname" name="display_name" value="${v("display_name")}"
      placeholder="${esc(me.name_zh || me.name_en || "")}">
      </label>
    <p class="sec-note">${T("st.nameNote")}</p>
    <div class="two">
      <label><i>${T("st.school")}</i><input id="sschool" name="school" list="schools" value="${v("school")}"
        autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
        placeholder="${esc(T("s.schoolPh"))}"></label>
      <label><i>${T("st.county")}</i><select id="scounty" name="county">
        <option value="">${T("s.pick")}</option>
        ${COUNTIES.map(c => `<option${s.county === c ? " selected" : ""}>${esc(c)}</option>`).join("")}
      </select></label>
    </div>
    <p class="sec-note">${T("st.countyNote")}</p>
    <div class="two">
      <label><i>${T("st.city")}</i><input id="scity" name="city" value="${v("city")}" placeholder="Vancouver"></label>
      <label><i>${T("st.country")}</i><input id="scountry" name="country" value="${v("country")}" placeholder="${esc(T("st.countryPh"))}"></label>
    </div>
    <label><i>${T("st.place")}</i><input id="splace" name="place" value="${v("place")}" placeholder="UBC"></label>
    <label><i>${T("st.quote")}</i><input id="squote" name="quote" value="${v("quote")}"
      placeholder="${esc(T("st.quotePh"))}"></label>
    <p class="sec-note">${T("st.quoteNote")}</p>
    <label><i>${T("st.note")}</i><input id="snote" name="note" value="${v("note")}"
      placeholder="${esc(T("st.notePh"))}"></label>
    <details class="enfold"><summary>${T("st.en")}</summary>
      <p class="sec-note">${T("st.enNote")}</p>
      <div class="two">
        <label><i>${T("st.schoolEn")}</i><input id="sschoolen" name="school_en" value="${v("school_en")}"></label>
        <label><i>${T("st.countryEn")}</i><input id="scountryen" name="country_en" value="${v("country_en")}"></label>
      </div>
      <label><i>${T("st.quoteEn")}</i><input id="squoteen" name="quote_en" value="${v("quote_en")}"></label>
      <label><i>${T("st.noteEn")}</i><input id="snoteen" name="note_en" value="${v("note_en")}"></label>
    </details>
    <label class="check">
      <input id="spub" name="public_story" type="checkbox"${on ? " checked" : ""}>
      <span>${T("st.consent")}</span>
    </label>
    <p class="sec-note" data-story-status>${esc(storyStatus(s))}</p>`;
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
const SAYS = [
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

// toast（2026-11-06 自動儲存）：畫面底下一小條字，掛在 <body> 上不在 #bt-root 裡，所以重畫不會洗掉它。
// 自動存的結果走這裡而不是卡片最上面那條 wnote：那條要 render() 才看得到，
// 而自動存的時候**不重畫**（使用者可能還在打字，重畫會把他的游標與剛打的字洗掉）。
// 跟 passport/src/main.js 的 toast 同一個形狀，CSS 在 index.html 的 .toast。
let toastT;
export function toast(msg) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".toast").forEach(n => n.remove());
  const d = document.createElement("div");
  d.className = "toast"; d.textContent = msg; d.setAttribute("role", "status");
  document.body.appendChild(d);
  clearTimeout(toastT);
  toastT = setTimeout(() => d.remove(), 4000);
}

// ── 自動儲存（2026-11-06，Paul：「希望每一格都像 Workspaces 那一頁一樣，改了就存」）。四份一模一樣（測試逐字比對）。 ──
// 規矩：打字的欄位（text、textarea）停 800 毫秒或離開欄位就存；選的（select、checkbox、radio、date）改了馬上存。
// 存的時候左下角照樣是 toast（存好了／存不起來），欄位旁邊多一個小字「存檔中…／存好了」。
// 存失敗**不重畫**，剛打的字留在格子裡，再改一下就會再存一次。
// 還留著按鈕的只有會「送出去、丟東西、花錢」的動作：上架與下架、標成可以用、移出成員、結束這一屆、刪掉、寄邀請、排會議、上傳。
//
// 怎麼接（每一個表單三步）：
//   1. ui.js：表單的容器加 data-autosave="<act>"（加 data-id 之類的辨識），欄位要有 name；拿掉「存起來」那顆鈕，
//      放 <span class="autosave" data-for="<act>">改了就存</span>（autosaveHint()）。
//   2. main.js：boot 時 UI.bindAutosave(root(), onAutosave) 一次；onAutosave(act, box, field) 讀 UI.formValues(box) 去存。
//   3. 存的時候 UI.autosaveState(box, "saving") → 成功 "saved" 加 toast → 失敗 "failed" 加錯誤 toast，**不 render()**。
export function debounce(fn, ms) {
  let t = null;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  d.flush = (...a) => { clearTimeout(t); t = null; fn(...a); };
  d.cancel = () => { clearTimeout(t); t = null; };
  return d;
}
export const AUTOSAVE_MS = 800;
// 打字的欄位（2026-10-28 Paul：「我要打完一句才存，現在是邊打邊存」）：離開那一格就存，或停手 4 秒才存。
// 勾選、選單這種按了就算數的還是馬上存（flush）。
export const TYPED_MS = 4000;
// 這一格要怎麼存："now"（選的）、"typed"（打字的）、null（不在 data-autosave 容器裡、或標了 data-noauto）。
export function saveMode(el) {
  if (!el || !el.closest || !el.closest("[data-autosave]")) return null;
  if (el.dataset && el.dataset.noauto) return null;
  const tag = String(el.tagName || "").toUpperCase(), type = String(el.type || "").toLowerCase();
  if (tag === "SELECT") return "now";
  if (tag === "TEXTAREA") return "typed";
  if (tag !== "INPUT") return null;
  if (["checkbox", "radio", "date", "time", "datetime-local", "month", "week", "color", "range", "number"].includes(type)) return "now";
  if (["button", "submit", "file", "hidden", "reset", "image"].includes(type)) return null;
  return "typed";
}
// 記每一格最後存成功的值，一樣就不再送一次（離開欄位又停 800 毫秒會觸發兩次）。
export function dirtyTracker() {
  const last = new Map();
  return {
    changed: (key, value) => !last.has(key) || last.get(key) !== value,
    mark: (key, value) => { last.set(key, value); },
    forget: key => { last.delete(key); },
  };
}
// 容器裡每一格讀成 { name: value }：文字去頭尾空白、checkbox 是布林、radio 取選到的、沒有 name 的不讀。
export function formValues(box) {
  const out = {};
  for (const f of box.querySelectorAll("input, select, textarea")) {
    const name = f.name || (f.dataset && f.dataset.name) || "";
    if (!name) continue;
    const type = String(f.type || "").toLowerCase();
    if (type === "checkbox") out[name] = !!f.checked;
    else if (type === "radio") { if (f.checked) out[name] = f.value; else if (!(name in out)) out[name] = out[name]; }
    else out[name] = typeof f.value === "string" ? f.value.trim() : f.value;
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}
export function autosaveHint(act, extra) { return `<span class="autosave" data-for="${esc(act)}"${extra ? ` ${extra}` : ""}>${esc(T("auto.hint"))}</span>`; }
// 欄位旁邊那個小字：saving → 「存檔中…」、saved → 「存好了」（兩秒後回到「改了就存」）、failed → 「沒存進去…」。
export function autosaveState(box, state) {
  if (!box || !box.querySelector) return;
  const el = box.querySelector(".autosave");
  if (!el) return;
  clearTimeout(el._t);
  el.classList.remove("saving", "saved", "failed");
  if (state === "saving") { el.classList.add("saving"); el.textContent = T("auto.saving"); }
  else if (state === "saved") { el.classList.add("saved"); el.textContent = T("auto.saved"); el._t = setTimeout(() => { el.classList.remove("saved"); el.textContent = T("auto.hint"); }, 2000); }
  else if (state === "failed") { el.classList.add("failed"); el.textContent = T("auto.failed"); }
  else el.textContent = T("auto.hint");
}
// 掛一次在 #bt-root 上（它不會被換掉，裡面的 innerHTML 才會）。onSave(act, box, field) 回 Promise。
// 同一個容器一次只跑一個存檔；跑的時候又改了，跑完再存一次（不丟掉後面那一次改動）。
export function bindAutosave(root, onSave) {
  if (!root || typeof document === "undefined" || root.dataset.autosave === "1") return;
  root.dataset.autosave = "1";
  // waiting：打了字、還在等那 4 秒的那一格。again：存的途中又改了的格子，跑完照順序一格一格補存。
  const timers = new Map(), running = new Map(), again = new Map(), waiting = new Map();
  const run = async (box, field) => {
    if (waiting.get(box) === field) waiting.delete(box);
    const act = box.dataset.autosave;
    if (running.get(box)) { const q = again.get(box) || []; if (!q.includes(field)) q.push(field); again.set(box, q); return; }
    running.set(box, true);
    try { await onSave(act, box, field); }
    finally {
      running.delete(box);
      const q = again.get(box);
      if (q && q.length) { const f = q.shift(); if (!q.length) again.delete(box); run(box, f); }
    }
  };
  const schedule = (field, now) => {
    const box = field.closest("[data-autosave]");
    if (!box || box === root) return;   // 不在任何存檔框裡（例如找名字的搜尋框）就不存；root 自己也掛著 data-autosave="1"
    let d = timers.get(box);
    if (!d) { d = debounce(f => run(box, f), TYPED_MS); timers.set(box, d); }
    if (!now) { waiting.set(box, field); d(field); return; }
    // 2026-10-28：同一個框裡另一格打的字還在等 4 秒，這時候選了下拉，先把打的那一格存掉，不然那幾個字會被下拉蓋過去。
    const w = waiting.get(box);
    if (w && w !== field) { waiting.delete(box); d.flush(w); run(box, field); }
    else d.flush(field);
  };
  // 打的字還在等、或還在存，人就要離開這一頁（點側欄去別頁、關分頁）：先送出去，再讓瀏覽器問一句「確定要離開嗎」。
  const flushAll = () => { for (const [box, f] of [...waiting]) { waiting.delete(box); const d = timers.get(box); if (d) d.flush(f); } };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAll(); });
  window.addEventListener("beforeunload", e => {
    const busy = waiting.size > 0 || running.size > 0;
    flushAll();
    if (busy) { e.preventDefault(); e.returnValue = ""; }
  });
  root.addEventListener("input", e => { const m = saveMode(e.target); if (m === "typed") schedule(e.target, false); });
  root.addEventListener("change", e => { const m = saveMode(e.target); if (m === "now") schedule(e.target, true); else if (m === "typed") schedule(e.target, true); });
  root.addEventListener("focusout", e => { const m = saveMode(e.target); if (m === "typed") { const box = e.target.closest("[data-autosave]"); const d = timers.get(box); if (d && waiting.get(box) === e.target) { waiting.delete(box); d.flush(e.target); } } });
}
