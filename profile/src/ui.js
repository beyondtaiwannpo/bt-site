// /profile/ 的畫面與純函式（2027-01-03，人的名錄變成關係網；資料庫那一半在 supabase/migrations/2027-01-03-people-network.sql）。
// 這一頁不用登入：BT 管紀錄的人替一位成年的聯絡人（講者、教授、招生官、校友）開一條個人連結 /profile/?t=…，
// 他打開看得到 BT 手上關於他的資料，改對、補上、回答六題故事、選 BT 可以拿去做什麼。
// **esc 是自己的一份**，不從別的資料夾 import；這一支也不 import shared/ 的任何東西，所以在 node 底下直接測得了（test/profile-page.test.mjs）。
//
// 三件一定要守的事（測試都守著）：
//   1. 存的時候**每一次都送整份**（toPayload）。資料庫的規矩是「有送的那一段整段換掉」：
//      學歷與經歷帶 id 的是改那一列、沒帶的是加一列、這次沒送回來的就是他拿掉的。所以載進來的每一列都要送回去，除非他自己按了拿掉。
//      五個勾每一次都照這次送的算，沒勾就是收回。聯絡方式送空字串是拿掉那一種（email 例外，空的不動）。
//   2. 「我已滿 18 歲」永遠不預先勾：fromServer 與草稿都不帶它，沒勾 validate 就不過、main.js 就不會叫資料庫。
//   3. 連結上的 token 只出現在兩個地方：main.js 叫資料庫的那兩句，以及換語言那顆的網址（langHref）。
//      草稿的鑰匙用 token 的雜湊（hashToken），不是 token 本身；這一支印出來的畫面裡沒有它。
// 畫面一次只印一種語言（en 旗標），換語言時 main.js 先把畫面上的字讀回來再重畫一次。

export const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const MAIL = "beyondtaiwan2020@gmail.com";
// 句子裡的那個信箱變成點得下去的連結（先逃脫再換）。
const mail = text => esc(text).replace(MAIL, `<a href="mailto:${MAIL}">${MAIL}</a>`);

export const STEPS = ["about", "education", "work", "story", "consent"];
export const STORY_KEYS = ["highschool", "turning", "hardest", "decision", "wish17", "first_step"];
export const CONTACT_KEYS = ["email", "phone", "linkedin", "ig", "line", "website"];
// 五個勾：前兩個是同意（BT 可以公開、可以引用），第三個是可以再聯絡，後兩個是他自己舉的手。
export const FLAGS = ["share_profile", "share_story", "contact_ok", "offer_speak", "offer_mentor"];
const TEXT_KEYS = ["name_en", "name_zh", "school", "city", "country", "job_title", "job_org", "field", "bio"];
const PROFILE_KEYS = ["city", "country", "job_title", "job_org", "field", "bio"];
const ROW_KEYS = { education: ["institution", "title", "major", "year"], career: ["institution", "title", "year"] };
// 上限跟資料庫同一組數字（rc_public_profile_save 與 rc_contact_norm）。改資料庫就要回來改這裡。
export const LIMITS = { name_zh: 40, name_en: 80, school: 120, city: 80, country: 80, job_title: 120, job_org: 120, field: 120, bio: 600,
                        story: 3000, contact: 200, institution: 160, major: 120, title: 120, rows: 10 };

// 六題故事。**字是定稿，一個字都不要動**（測試逐字比對）。
export const STORY = {
  highschool: ["高中的你是什麼樣子？那時候想成為什麼樣的人？", "What were you like in high school, and what did you want to become then?"],
  turning:    ["是哪一個轉捩點，讓你走上現在這條路？", "What was the turning point that set you on your current path?"],
  hardest:    ["最難的一刻是什麼？你怎麼走過來的？", "What was the hardest moment, and how did you get through it?"],
  decision:   ["有哪一個決定你會再做一次？哪一個你會改？", "What's one decision you'd make again, and one you'd change?"],
  wish17:     ["你希望 17 歲的時候有人告訴你什麼？", "What do you wish someone had told you at 17?"],
  first_step: ["如果一個台灣學生想走你這條路，他第一步該做什麼？", "If a Taiwanese student wanted your path, what should they do first?"],
};

// 每一格的名字。表單的 label 與「寫太長了」那一句用同一份。
export const LABEL = {
  name_en: ["英文名字", "English name"], name_zh: ["中文名字", "Chinese name"],
  city: ["現在住的城市", "Current city"], country: ["國家", "Country"],
  "contacts.email": ["Email", "Email"], "contacts.phone": ["電話", "Phone"], "contacts.linkedin": ["LinkedIn", "LinkedIn"],
  "contacts.ig": ["Instagram", "Instagram"], "contacts.line": ["LINE ID", "LINE ID"], "contacts.website": ["個人網站", "Website"],
  school: ["高中", "High school"],
  "education.institution": ["學校", "University or school"], "education.title": ["學位（例如學士、碩士、博士）", "Degree (for example BSc, MA, PhD)"],
  "education.major": ["主修", "Major"], "education.year": ["畢業年", "Graduation year"],
  job_title: ["現在的職稱", "Current job title"], job_org: ["現在的公司或單位", "Current organisation"],
  field: ["專長領域", "Field or area of expertise"], bio: ["簡短的自我介紹", "Short bio"],
  "career.institution": ["公司或單位", "Organisation"], "career.title": ["職稱", "Title"], "career.year": ["開始的年份", "Start year"],
};

// 五個勾各自的一句話：[名字, 這代表什麼]。
export const CONSENT = {
  share_profile: [["BT 可以公開我的名字、照片跟職稱", "例如放在活動頁，或是歷屆講者的名單上。"],
                  ["BT may show my name, photo and title publicly", "For example on event pages and the list of past speakers."]],
  share_story:   [["BT 可以引用我寫的故事", "用在介紹你的文字、社群貼文，還有給學生看的材料裡。"],
                  ["BT may quote my story answers", "In introductions, posts and materials for students."]],
  contact_ok:    [["BT 之後可以再聯絡我", "例如有活動想邀請你，或是有學生的問題想請教你。"],
                  ["BT may contact me again", "For example to invite you to a later event, or to pass on a student's question."]],
  offer_speak:   [["我願意在 BT 的活動分享", "勾了只代表你有意願。有適合的場次，BT 會先問過你。"],
                  ["I am open to speaking at a BT event", "Ticking this only says you are open to it. BT will ask you first when a session fits."]],
  offer_mentor:  [["我願意當學生的 mentor", "勾了只代表你有意願。BT 會先問過你，才會安排。"],
                  ["I am open to mentoring a student", "Ticking this only says you are open to it. BT will ask you before arranging anything."]],
};

// 畫面上其他的字：[中文, 英文]。{x} 是要代入的值。
export const TX = {
  title: ["你在 Beyond Taiwan 的資料", "Your details with Beyond Taiwan"],
  s_about: ["關於你", "About you"], s_education: ["學歷", "Education"], s_work: ["工作", "Work"], s_story: ["你的故事", "Your story"], s_consent: ["BT 可以做什麼", "What BT may do"],
  stepOf: ["第 {i} 步，共 {n} 步", "Step {i} of {n}"], stepsNav: ["填寫步驟", "Steps"],
  hello: ["{name}，你好。", "Hello {name},"], helloPlain: ["你好。", "Hello,"],
  who: ["Beyond Taiwan（BT）是學生自己在經營的非營利組織，幫台灣的公立高中生申請國外的大學。",
        "Beyond Taiwan (BT) is a student-run non-profit that helps students from Taiwan's public high schools apply to universities abroad."],
  why: ["BT 想把每一位幫過忙的人記清楚：介紹你的時候才不會講錯，學生有問題的時候，也知道可以請教誰。所以想請你看一下 BT 手上的資料對不對，再補幾件事。",
        "We want to keep an accurate record of the people who help us, so that we introduce you correctly and know who to ask when a student has a question. Please check what we have about you and add a few things."],
  time: ["大概花 10 分鐘。只有名字一定要填，其他的都可以跳過。", "It takes about ten minutes. Only your name is required. Everything else is optional."],
  how: ["到最後一步按「儲存」才會送出。之後再打開同一條連結，看得到你存過的內容，隨時可以回來改。",
        "Nothing is sent until you press Save on the last step. Open this same link again later to see what you saved and change it."],
  again: ["你上次是 {date}存的，下面是當時的內容，可以直接改。", "You last saved on {date}. What you saved is below, and you can change any of it."],
  evNext: ["你會在「{title}」分享，日期是台灣時間 {date}。", "You are speaking at {title} on {date} (Taiwan time)."],
  evNextNoDate: ["你會在「{title}」分享。", "You are speaking at {title}."],
  evPast: ["你在「{title}」分享過，那一天是 {date}。", "You spoke at {title} on {date}."],
  photoHas: ["這張照片是 BT 放的。想換一張或拿掉，寫信到 beyondtaiwan2020@gmail.com 跟 BT 說一聲就好。",
             "BT added this photo. To change or remove it, write to beyondtaiwan2020@gmail.com."],
  photoNone: ["這一頁沒辦法上傳照片。需要照片的時候，BT 會另外跟你要。", "This page cannot take photo uploads. If BT needs a photo, we will ask you separately."],
  photoAlt: ["BT 放的照片", "Photo added by BT"],
  nameH: ["名字", "Name"], nameLead: ["名字一定要填，中文或英文至少一個。", "A name is required: English, Chinese, or both."],
  whereH: ["現在在哪裡", "Where you are now"],
  contactsH: ["聯絡方式", "Contact details"],
  contactsLead: ["這些是讓 BT 聯絡你用的，不會放在任何對外的頁面。每一格都可以空著。", "These are for BT to reach you and are never shown on any public page. Leave any of them blank."],
  emailHint: ["這一格清空不會刪掉 BT 原本有的 email。想請 BT 刪掉，寫信到 beyondtaiwan2020@gmail.com。",
              "Clearing this box does not delete the email BT already has. To have it removed, write to beyondtaiwan2020@gmail.com."],
  phoneHint: ["記得加國碼，例如 +886。", "Include the country code, for example +1."],
  eduLead: ["先看高中對不對，再列出你念過或正在念的大學跟研究所。都可以跳過。", "Check your high school, then list the universities you attended or are attending. All of it is optional."],
  eduH: ["大學與研究所", "Universities"], eduRow: ["第 {i} 所", "School {i}"], eduEmpty: ["還沒有列任何學校。", "No schools listed yet."],
  eduYearHint: ["西元年，4 位數。還沒畢業就填預計畢業的那一年。", "Four digits. If you have not graduated yet, give the year you expect to."],
  enrolled: ["我還在這裡念書", "I am still studying here"],
  eduAdd: ["加一所學校", "Add a school"], eduDel: ["拿掉第 {i} 所學校", "Remove school {i}"],
  workLead: ["現在在做什麼，以前做過什麼。都可以跳過。", "What you do now and what you did before. All of it is optional."],
  nowH: ["現在", "Now"],
  fieldHint: ["寫一行就好，例如「半導體製程」或「公共衛生政策」。學生有這方面的問題時，BT 會靠這一格找到可以請教的人。",
              "One line is enough, for example “semiconductor process engineering” or “public health policy”. BT uses it to match you with students' questions."],
  bioHint: ["最多 600 個字。", "Up to 600 characters."],
  careerH: ["以前的工作", "Past roles"], careerRow: ["第 {i} 份", "Role {i}"], careerEmpty: ["還沒有列任何工作。", "No past roles listed yet."],
  careerYearHint: ["西元年，4 位數。", "Four digits."],
  careerAdd: ["加一份工作", "Add a role"], careerDel: ["拿掉第 {i} 份工作", "Remove role {i}"],
  del: ["拿掉這一筆", "Remove"], rowsMax: ["最多列 10 筆。", "You can list up to 10."],
  storyLead: ["這 6 題都可以不寫。不用寫得漂亮，短短幾句老實話就很好。BT 要用這些內容之前，一定要你在下一步同意才行。",
              "All six questions are optional. Short, honest answers are better than polished ones. BT only reuses what you write here if you agree in the next step."],
  consentLead: ["下面每一項都是分開的。沒勾就是不同意，完全沒關係。", "Each item below is separate. Leaving a box unticked means no, and that is completely fine."],
  consentAgain: ["你之前勾過的還在。取消勾選再按儲存，就是收回。", "The boxes you ticked before are still ticked. Untick one and press Save to withdraw it."],
  mayH: ["BT 可以做的事", "What BT may do"], offerH: ["你願意的事", "What you are open to"],
  adult: ["我已滿 18 歲", "I am 18 or older"], adultHelp: ["必填。這一頁只給成年人填。", "Required. This page is for adults only."],
  later: ["這些之後都可以改，也可以收回：再打開同一條連結改掉，或寫信到 beyondtaiwan2020@gmail.com。",
          "You can change or withdraw any of this later: open this same link again, or write to beyondtaiwan2020@gmail.com."],
  privacyPre: ["BT 怎麼保管資料，寫在", "How BT looks after your data is set out in the "], privacy: ["隱私政策", "Privacy Policy"], privacyPost: ["。", "."],
  back: ["上一步", "Back"], next: ["下一步", "Next"], save: ["儲存", "Save"], saving: ["儲存中…", "Saving…"],
  keep: ["你打的內容會先留在這個分頁，重新整理不會不見。關掉分頁就沒了，按了儲存才算數。",
         "What you type is kept in this tab only, so a refresh does not lose it. Closing the tab clears it. Nothing counts until you press Save."],
  fix: ["有幾格要再看一下，已經標出來了。", "A few boxes need another look. They are marked below."],
  doneH: ["存好了，謝謝你。", "Saved. Thank you."], doneLead: ["BT 現在有的是這些：", "Here is what BT now has:"],
  doneName: ["名字：{v}", "Name: {v}"], doneEdu: ["學歷：{n} 筆", "Education entries: {n}"], doneCareer: ["以前的工作：{n} 筆", "Past roles: {n}"],
  doneStory: ["故事：6 題裡寫了 {n} 題", "Story questions answered: {n} of 6"],
  doneYes: ["你勾了這幾項：", "You ticked:"], doneNone: ["5 個選項你都沒有勾。", "You did not tick any of the five boxes."],
  doneUntil: ["這條連結到台灣時間 {date}之前都打得開，想改隨時回來。", "This link keeps working until {date} (Taiwan time), so you can come back and edit."],
  doneLater: ["想改的時候，再打開同一條連結就好。", "To change anything, just open this same link again."],
  doneEdit: ["回去修改", "Go back and edit"], home: ["回 Beyond Taiwan 首頁", "Back to Beyond Taiwan"],
  wrong: ["這條連結打不開，可能是過期了，或是已經換成新的。寫信到 beyondtaiwan2020@gmail.com，BT 會再給你一條。",
          "This link does not work. It may have expired or been replaced. Write to beyondtaiwan2020@gmail.com and BT will send you a new one."],
  loadFail: ["現在連不上資料庫。等一下重新整理再試，或是寫信到 beyondtaiwan2020@gmail.com。",
             "We cannot reach the database right now. Please reload in a moment, or write to beyondtaiwan2020@gmail.com."],
  loadOffline: ["你現在好像沒有連上網路。連上之後重新整理就好。", "You seem to be offline. Reconnect, then reload this page."],
  // 2027-01-25：帳號。存好之後那一塊、登入之後的那一行、連結打不開時多的那一句。
  wrongLogin: ["已經有 BT 的帳號了？", "Already have a BT account?"], signIn: ["登入", "Sign in"],
  laterSelf: ["這些之後都可以改，也可以收回：登入之後回到這一頁改掉，或寫信到 beyondtaiwan2020@gmail.com。",
              "You can change or withdraw any of this later: sign in and come back to this page, or write to beyondtaiwan2020@gmail.com."],
  selfBar: ["你已經登入，這是你在 BT 的檔案，改完按儲存。", "You are signed in. This is your BT profile; press Save when you are done."],
  settings: ["設定", "Settings"], events: ["活動", "Events"],
  accH: ["你的帳號", "Your account"],
  accInvited: ["我們寄了一封信到 {email}。按信裡的按鈕，用這個 email 登入，之後想改檔案、補故事、看 BT 在做什麼，登入就好。",
               "We sent an email to {email}. Use the button in it to sign in with that email; after that you can sign in any time to update your profile, add to your story and see what BT is up to."],
  accInvitedBefore: ["我們之前寄過一封信到 {email}，用信裡的按鈕登入就好。", "We already sent an email to {email}. Use the button in it to sign in."],
  accNow: ["也可以現在就開：", "Or set it up now:"], accGo: ["現在開我的帳號", "Set up my account now"],
  accHow: ["用 {email} 登入或註冊，用 Google 也可以（選同一個 email）。開好之後登入，看到的就是這一份檔案。",
           "Sign in or sign up with {email}. Google works too (pick the same email). Once it is set up, signing in brings you back to this profile."],
  accHas: ["你已經有 BT 的帳號了。之後想改，登入就好，不用再找這條連結。", "You already have a BT account. To change anything later, just sign in; you will not need this link."],
  accLogin: ["{email} 已經有一個 BT 的帳號，用它登入就好。BT 會把兩邊的資料合成一份。", "{email} already has a BT account, so just sign in with it. BT will merge the two records into one."],
  accPending: ["BT 已經寄過一封邀請信給你，用那封信裡的連結開帳號就好。找不到那封信的話，寫信到 beyondtaiwan2020@gmail.com。",
               "BT has already emailed you an invitation. Use the link in that email to set up your account. If you cannot find it, write to beyondtaiwan2020@gmail.com."],
  accNoEmail: ["想要一個帳號的話，回到第一步留一個 email 再存一次，我們就會寄登入的信給你。", "If you would like an account, go back to step one, add an email and save again. We will send you a sign-in email."],
  accFail: ["檔案已經存好了，但帳號這一步現在沒成功。等一下再按一次儲存，或寫信到 beyondtaiwan2020@gmail.com。",
            "Your profile is saved, but setting up your account did not work just now. Press Save again in a moment, or write to beyondtaiwan2020@gmail.com."],
  noMine: ["你的帳號還沒有連到 BT 名單上的檔案。寫信到 beyondtaiwan2020@gmail.com，BT 會幫你接上。",
           "Your account is not linked to a profile in BT's list yet. Write to beyondtaiwan2020@gmail.com and BT will connect it."],
  noMineCadre: ["幹部的資料在設定那一頁。", "As a BT cadre, your details are on the Settings page."],
};
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : ""));
export const t = (key, en, vars) => fill((TX[key] || ["", ""])[en ? 1 : 0], vars);
const lab = (key, en) => (LABEL[key] || ["", ""])[en ? 1 : 0];

// ── 錯誤 ────────────────────────────────────────────────────────────────
// 資料庫丟回來的代碼（rc_public_profile_save）加上這一頁自己先擋的幾種。每一種兩個語言各一句。
export const ERR = {
  bad_link: ["這條連結已經失效，所以沒有存進去。先把你寫的內容複製起來，再寫信到 beyondtaiwan2020@gmail.com 跟 BT 要一條新的。",
             "This link is no longer valid, so nothing was saved. Copy what you wrote somewhere safe, then write to beyondtaiwan2020@gmail.com for a new link."],
  adult_only: ["要先勾「我已滿 18 歲」才能儲存。", "Please confirm that you are 18 or older before saving."],
  need_name: ["中文名字或英文名字至少填一個。", "Please fill in at least one name, English or Chinese."],
  bad_email: ["email 的格式不對，再看一下。", "That email does not look right. Please check it."],
  too_long: ["「{label}」寫太長了，最多 {n} 個字。", "“{label}” is too long. The limit is {n} characters."],
  too_long_row: ["學歷或工作經歷裡有一格寫太長了。學校跟公司的名稱最多 160 個字，學位、主修、職稱最多 120 個字。",
                 "One of the education or work entries is too long. School and organisation names can be up to 160 characters; degree, major and title up to 120."],
  too_many: ["這條連結過去 1 個小時存了太多次。你打的內容都還在，過 1 個小時再按一次儲存。",
             "This link has been saved too many times in the past hour. Everything you typed is still here. Please press Save again in an hour."],
  too_many_rows: ["學歷跟以前的工作各最多 10 筆，拿掉幾筆再存。", "You can list at most 10 schools and 10 past roles. Please remove a few and save again."],
  bad_list: ["學歷或工作經歷那一段的格式怪怪的。重新整理再試一次，還是不行就寫信到 beyondtaiwan2020@gmail.com。",
             "Something is wrong with the education or work list. Reload and try again. If it keeps happening, write to beyondtaiwan2020@gmail.com."],
  bad_year: ["年份要填 4 位數的西元年，1950 到 2100 之間。", "Use a four-digit year between 1950 and 2100."],
  row_need_school: ["這一筆少了學校的名字。補上去，或是把這一筆拿掉。", "This entry has no school name. Add one, or remove the entry."],
  row_need_org: ["這一筆少了公司或單位的名字。補上去，或是把這一筆拿掉。", "This entry has no organisation name. Add one, or remove the entry."],
  network: ["連不上 BT 的資料庫，所以還沒存進去。你打的內容都還在，確認網路之後再按一次儲存。",
            "We could not reach BT's database, so nothing has been saved yet. Everything you typed is still here. Check your connection and press Save again."],
  unknown: ["沒有存進去。你打的內容都還在，再按一次儲存；還是不行就寫信到 beyondtaiwan2020@gmail.com。",
            "That did not save. Everything you typed is still here. Press Save again, and if it keeps failing write to beyondtaiwan2020@gmail.com."],
};
// 錯誤（資料庫回的物件、Error、或這一頁自己的代碼字串）→ { code, field }。field 是「寫太長了」後面接的那一格。
export function parseError(err) {
  const m = String((err && err.message) || err || "");
  const tl = m.match(/too_long:([a-z0-9_.]+)/);
  if (tl) return { code: "too_long", field: tl[1] };
  // too_many_rows 要排在 too_many 前面：後者是前者的開頭。
  for (const c of ["bad_link", "adult_only", "need_name", "bad_email", "too_many_rows", "too_many", "bad_list", "bad_year", "row_need_school", "row_need_org"]) if (m.includes(c)) return { code: c, field: "" };
  if (m.includes("too_long")) return { code: "too_long", field: "" };
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed|no_client/i.test(m)) return { code: "network", field: "" };
  return { code: "unknown", field: "" };
}
// 「寫太長了」那一格在畫面上的路徑與上限。對不到的（row、沒帶名字的）回 null。
function longTarget(field) {
  const f = String(field || "");
  if (f === "name" || f === "name_en") return { path: "name_en", key: "name_en", n: LIMITS.name_en };
  if (f === "name_zh") return { path: "name_zh", key: "name_zh", n: LIMITS.name_zh };
  if (["school", "city", "country", "job_title", "job_org", "field", "bio"].includes(f)) return { path: f, key: f, n: LIMITS[f] };
  if (STORY_KEYS.includes(f)) return { path: "story." + f, key: "story." + f, n: LIMITS.story };
  if (f.startsWith("story.") && STORY_KEYS.includes(f.slice(6))) return { path: f, key: f, n: LIMITS.story };
  if (CONTACT_KEYS.includes(f)) return { path: "contacts." + f, key: "contacts." + f, n: LIMITS.contact };
  if (f.startsWith("contacts.") && CONTACT_KEYS.includes(f.slice(9))) return { path: f, key: f, n: LIMITS.contact };
  const row = f.match(/^(education|career)\.(\d+)\.(institution|major|title)$/);
  if (row) return { path: f, key: row[1] + "." + row[3], n: LIMITS[row[3]] };
  return null;
}
// 這個錯誤該放在哪一格底下。回那一格的路徑，沒有對得到的格子回空字串（main.js 就放在最上面）。
export function errorField(err) {
  const e = parseError(err);
  if (e.code === "adult_only") return "adult";
  if (e.code === "need_name") return "name_en";
  if (e.code === "bad_email") return "contacts.email";
  if (e.code === "too_long") { const g = longTarget(e.field); return g ? g.path : ""; }
  return "";
}
// 錯誤 → 一句人話。
export function errorText(err, en) {
  const e = parseError(err), i = en ? 1 : 0;
  if (e.code === "too_long") {
    const g = longTarget(e.field);
    if (!g) return ERR.too_long_row[i];
    const label = g.key.startsWith("story.") ? STORY[g.key.slice(6)][i] : lab(g.key, en);
    return fill(ERR.too_long[i], { label, n: g.n });
  }
  return (ERR[e.code] || ERR.unknown)[i];
}

// ── 狀態 ────────────────────────────────────────────────────────────────
const str = v => (v == null ? "" : String(v));
const len = s => [...str(s).trim()].length;   // 照字數算（跟資料庫的 char_length 一樣），不是照 UTF-16 的長度
const clone = o => JSON.parse(JSON.stringify(o));
const obj = (keys, f) => Object.fromEntries(keys.map(k => [k, f(k)]));

export function blank() {
  return Object.assign(obj(TEXT_KEYS, () => ""), {
    story: obj(STORY_KEYS, () => ""), contacts: obj(CONTACT_KEYS, () => ""), education: [], career: [],
  }, obj(FLAGS, () => false), { adult: false });
}
// 資料庫回的那一份（rc_public_profile）→ 表單的狀態。五個勾只有資料庫裡真的是 true 才勾；adult 永遠是 false。
export function fromServer(d) {
  const s = blank(), pe = (d && d.person) || {}, pf = (d && d.profile) || {}, st = pf.story || {}, ct = (d && d.contacts) || {};
  s.name_en = str(pe.name_en); s.name_zh = str(pe.name_zh); s.school = str(pe.school);
  for (const k of PROFILE_KEYS) s[k] = str(pf[k]);
  for (const k of STORY_KEYS) s.story[k] = str(st[k]);
  for (const k of CONTACT_KEYS) s.contacts[k] = str(ct[k]);
  for (const k of FLAGS) s[k] = pf[k] === true;
  s.education = ((d && d.education) || []).map(r => ({ id: str(r.id), institution: str(r.institution), title: str(r.title), major: str(r.major), year: str(r.year), enrolled: r.kind === "enrolled" }));
  s.career = ((d && d.career) || []).map(r => ({ id: str(r.id), institution: str(r.institution), title: str(r.title), year: str(r.year) }));
  return s;
}
// 改一格。path 是那一格的 name：name_en、contacts.email、story.turning、education.2.year、education.2.enrolled、share_story、adult。
// 不認得的路徑不動（不讓畫面上多出來的格子寫進狀態）。回一份新的狀態，原本那份不改。
export function setField(state, path, value) {
  const s = clone(state), p = String(path || "").split(".");
  if (p.length === 1) {
    if (FLAGS.includes(p[0]) || p[0] === "adult") s[p[0]] = value === true;
    else if (TEXT_KEYS.includes(p[0])) s[p[0]] = str(value);
  } else if (p.length === 2 && p[0] === "story" && STORY_KEYS.includes(p[1])) s.story[p[1]] = str(value);
  else if (p.length === 2 && p[0] === "contacts" && CONTACT_KEYS.includes(p[1])) s.contacts[p[1]] = str(value);
  else if (p.length === 3 && ROW_KEYS[p[0]] && /^\d+$/.test(p[1]) && s[p[0]][Number(p[1])]) {
    const row = s[p[0]][Number(p[1])];
    if (p[0] === "education" && p[2] === "enrolled") row.enrolled = value === true;
    else if (ROW_KEYS[p[0]].includes(p[2])) row[p[2]] = str(value);
  }
  return s;
}
// 把畫面上的格子讀回狀態。fields 是一串像 input 的東西（{ name, type, value, checked }），main.js 丟 form.elements 進來，測試丟普通物件。
// 畫面上一次只有一步的格子，其他步的值留在狀態裡不動。
export function readForm(fields, state) {
  let s = state;
  for (const f of Array.from(fields || [])) {
    if (!f || !f.name) continue;
    s = setField(s, f.name, f.type === "checkbox" ? f.checked === true : f.value);
  }
  return s;
}
export function addRow(state, list) {
  const s = clone(state);
  if (!ROW_KEYS[list] || s[list].length >= LIMITS.rows) return s;
  s[list].push(list === "education" ? { id: "", institution: "", title: "", major: "", year: "", enrolled: false } : { id: "", institution: "", title: "", year: "" });
  return s;
}
// 拿掉一列。帶 id 的那一列從此不在狀態裡，toPayload 就不會送它，資料庫就把它刪掉。
export function removeRow(state, list, index) {
  const s = clone(state);
  if (ROW_KEYS[list] && s[list][Number(index)]) s[list].splice(Number(index), 1);
  return s;
}

// ── 送出去的那一份 ──────────────────────────────────────────────────────
const yearOut = v => (/^\d{4}$/.test(str(v).trim()) ? Number(str(v).trim()) : null);
const rowHasText = (r, list) => ROW_KEYS[list].some(k => str(r[k]).trim() !== "");
// 載進來的列（有 id）一律留著送回去；新加的列整列空白才不送。
const rowsOut = (state, list) => (state[list] || []).filter(r => r.id || rowHasText(r, list));
// rc_public_profile_save 的 p。**每一次都是整份**：每一段都在、六種聯絡方式都在（空的送空字串）、五個勾都在。
export function toPayload(state) {
  const s = state || blank(), tr = v => str(v).trim();
  return Object.assign({
    adult: s.adult === true,
    name_zh: tr(s.name_zh), name_en: tr(s.name_en), school: tr(s.school),
    profile: obj(PROFILE_KEYS, k => tr(s[k])),
    story: obj(STORY_KEYS, k => tr((s.story || {})[k])),
    contacts: obj(CONTACT_KEYS, k => tr((s.contacts || {})[k])),
    education: rowsOut(s, "education").map(r => Object.assign(r.id ? { id: r.id } : {}, {
      kind: r.enrolled ? "enrolled" : "graduated", institution: tr(r.institution), major: tr(r.major), title: tr(r.title), year: yearOut(r.year) })),
    career: rowsOut(s, "career").map(r => Object.assign(r.id ? { id: r.id } : {}, { institution: tr(r.institution), title: tr(r.title), year: yearOut(r.year) })),
  }, obj(FLAGS, k => s[k] === true));
}

// ── 檢查 ────────────────────────────────────────────────────────────────
export const isEmail = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str(v).trim());
const yearOk = v => { const y = str(v).trim(); return y === "" || (/^\d{4}$/.test(y) && Number(y) >= 1950 && Number(y) <= 2100); };
// 一格的路徑在第幾步（1 到 5）。
export function stepOf(path) {
  const p = String(path || "").split(".")[0];
  if (p === "education" || p === "school") return 2;
  if (p === "career" || ["job_title", "job_org", "field", "bio"].includes(p)) return 3;
  if (p === "story") return 4;
  if (FLAGS.includes(p) || p === "adult") return 5;
  return 1;
}
// 送出前（或按下一步前）看一遍。回 { ok, errors: { 路徑: 代碼 }, step: 第一個有錯的那一步 }。
// 給了 step 就只看那一步的格子（按「下一步」時用）；沒給就整份都看（按「儲存」時用，這時才要求勾滿 18 歲）。
export function validate(state, step) {
  const s = state || blank(), errors = {};
  if (len(s.name_en) === 0 && len(s.name_zh) === 0) errors.name_en = "need_name";
  for (const k of TEXT_KEYS) if (len(s[k]) > LIMITS[k]) errors[k] = "too_long:" + k;
  for (const k of CONTACT_KEYS) if (len(s.contacts[k]) > LIMITS.contact) errors["contacts." + k] = "too_long:contacts." + k;
  if (len(s.contacts.email) > 0 && !isEmail(s.contacts.email)) errors["contacts.email"] = "bad_email";
  for (const k of STORY_KEYS) if (len(s.story[k]) > LIMITS.story) errors["story." + k] = "too_long:story." + k;
  for (const list of ["education", "career"]) {
    if (s[list].length > LIMITS.rows) errors[list] = "too_many_rows";
    s[list].forEach((r, i) => {
      const at = k => `${list}.${i}.${k}`;
      if (rowHasText(r, list) && len(r.institution) === 0) errors[at("institution")] = list === "education" ? "row_need_school" : "row_need_org";
      for (const k of ["institution", "title", "major"]) if (k in r && len(r[k]) > LIMITS[k]) errors[at(k)] = "too_long:" + at(k);
      if (!yearOk(r.year)) errors[at("year")] = "bad_year";
    });
  }
  if (step == null && s.adult !== true) errors.adult = "adult_only";
  const kept = step == null ? errors : Object.fromEntries(Object.entries(errors).filter(([p]) => stepOf(p) === Number(step)));
  const steps = Object.keys(kept).map(stepOf).sort((a, b) => a - b);
  return { ok: steps.length === 0, errors: kept, step: steps.length ? steps[0] : 0 };
}

// ── 日期（台灣時間）─────────────────────────────────────────────────────
const WD_ZH = { Sunday: "日", Monday: "一", Tuesday: "二", Wednesday: "三", Thursday: "四", Friday: "五", Saturday: "六" };
// 「2027 年 1 月 3 日（日）」或 "Sunday, 3 January 2027"。活動在台灣辦，所以不管看的人在哪裡，印的都是台灣的那一天。
export function dateText(v, en) {
  const d = new Date(v); if (!v || isNaN(d)) return "";
  const p = {};
  for (const x of new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", year: "numeric", month: "long", day: "numeric", weekday: "long" }).formatToParts(d)) p[x.type] = x.value;
  if (en) return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
  const m = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", month: "numeric" }).format(d);
  return `${p.year} 年 ${m} 月 ${p.day} 日（${WD_ZH[p.weekday] || ""}）`;
}
// 「你會在某一場分享」那幾句。過去的場次換成「分享過」；now 是給測試固定時間用的。
export function eventLines(events, en, now) {
  const at = now == null ? Date.now() : new Date(now).getTime();
  return (events || []).map(e => {
    const title = str(en ? (e.title_en || e.title_zh) : (e.title_zh || e.title_en)).trim();
    if (!title) return "";
    const date = dateText(e.starts_at, en);
    if (!date) return t("evNextNoDate", en, { title });
    // 當天還算「會分享」：活動開始後一天內都不改口。
    return t(new Date(e.starts_at).getTime() < at - 86400000 ? "evPast" : "evNext", en, { title, date });
  }).filter(Boolean);
}

// ── 換語言的網址、草稿 ──────────────────────────────────────────────────
// 換語言那顆的網址：token 留著，只換 lang。**token 只准出現在這裡與 main.js 叫資料庫的那兩句。**
export function langHref(token, lang) {
  const l = lang === "en" ? "en" : "zh";
  return token ? `?t=${encodeURIComponent(token)}&lang=${l}` : `?lang=${l}`;
}
// token 的雜湊（cyrb53，53 個 bit）。草稿的鑰匙用它，瀏覽器的儲存空間裡就不會躺著一條能打開那個人資料的連結。
export function hashToken(token) {
  const s = String(token || "");
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
// 填到一半的內容：只放 sessionStorage（這個分頁關掉就沒了），存成功就清掉。
// base 是載進來那一刻資料庫那一份的 updated_at：他在別的地方存過新的，舊草稿就不拿來蓋。
// 「我已滿 18 歲」不進草稿。store 是給測試換掉用的；每一句都包 try，無痕視窗或擋了網站資料的瀏覽器照樣能填，只是不留。
export const draftKey = token => "bt.pf.draft." + hashToken(token);
const ss = store => store || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
export function draftSave(token, state, step, base, store) {
  try {
    const s = clone(state || blank()); delete s.adult;
    if (ss(store)) ss(store).setItem(draftKey(token), JSON.stringify({ state: s, step: Number(step) || 1, base: str(base) }));
  } catch (e) { /* 存不了就算了 */ }
}
export function draftLoad(token, base, store) {
  try {
    const raw = ss(store) && ss(store).getItem(draftKey(token)); if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !d.state || str(d.base) !== str(base)) return null;
    // 用 readForm 那一套白名單把草稿倒回一份乾淨的狀態：儲存空間裡多出來的鍵不會進來，adult 一定是 false。
    const s = blank();
    for (const k of TEXT_KEYS) s[k] = str(d.state[k]);
    for (const k of STORY_KEYS) s.story[k] = str((d.state.story || {})[k]);
    for (const k of CONTACT_KEYS) s.contacts[k] = str((d.state.contacts || {})[k]);
    for (const k of FLAGS) s[k] = d.state[k] === true;
    s.education = (Array.isArray(d.state.education) ? d.state.education : []).slice(0, LIMITS.rows).map(r => ({ id: str(r && r.id), institution: str(r && r.institution), title: str(r && r.title), major: str(r && r.major), year: str(r && r.year), enrolled: !!(r && r.enrolled === true) }));
    s.career = (Array.isArray(d.state.career) ? d.state.career : []).slice(0, LIMITS.rows).map(r => ({ id: str(r && r.id), institution: str(r && r.institution), title: str(r && r.title), year: str(r && r.year) }));
    const step = Number(d.step);
    return { state: s, step: step >= 1 && step <= STEPS.length ? step : 1 };
  } catch (e) { return null; }
}
export function draftClear(token, store) { try { if (ss(store)) ss(store).removeItem(draftKey(token)); } catch (e) { /* 同上 */ } }

// ── 畫面 ────────────────────────────────────────────────────────────────
export const fieldId = path => "pf-" + String(path).replace(/\./g, "-");
export const countText = (value, max) => `${[...str(value)].length} / ${max}`;
const errLine = (path, code, en) => `<p class="pf-err" id="${fieldId(path)}-e" role="alert"${code ? "" : " hidden"}>${code ? mail(errorText(code, en)) : ""}</p>`;
const describedBy = (path, hasHint, code) => { const ids = [hasHint ? fieldId(path) + "-h" : "", code ? fieldId(path) + "-e" : ""].filter(Boolean).join(" "); return ids ? ` aria-describedby="${ids}"` : ""; };

// 一格文字。o：{ label, hint, type, max, auto, mode, area, rows, counter, lang, required }
function field(path, value, errors, en, o) {
  const id = fieldId(path), code = (errors || {})[path], hint = o.hint || "";
  const common = `id="${id}" name="${esc(path)}" maxlength="${o.max}"${o.auto ? ` autocomplete="${o.auto}"` : ' autocomplete="off"'}${o.mode ? ` inputmode="${o.mode}"` : ""}${o.plain ? ' spellcheck="false" autocapitalize="off" autocorrect="off"' : ""}${o.lang ? ` lang="${o.lang}"` : ""}${o.required ? ' aria-required="true"' : ""}${code ? ' aria-invalid="true"' : ""}${describedBy(path, !!hint || !!o.counter, code)}`;
  const control = o.area
    ? `<textarea ${common} rows="${o.rows || 4}">${esc(value)}</textarea>`
    : `<input type="${o.type || "text"}" ${common} value="${esc(value)}">`;
  const help = hint || o.counter
    ? `<p class="pf-h" id="${id}-h">${hint ? mail(hint) : ""}${o.counter ? `${hint ? " " : ""}<span class="pf-n" id="${id}-c">${esc(countText(value, o.max))}</span>` : ""}</p>` : "";
  return `<div class="pf-f${code ? " pf-bad" : ""}${o.wide ? " pf-wide" : ""}" data-f="${esc(path)}"><label class="pf-l" for="${id}">${esc(o.label)}</label>${help}${control}${errLine(path, code, en)}</div>`;
}
const text = (path, state, errors, en, o) => field(path, path.split(".").reduce((a, k) => (a == null ? "" : a[k]), state), errors, en, Object.assign({ label: lab(path, en), max: LIMITS[path] }, o || {}));

// 一個勾。o：{ title, help }
function tick(path, on, errors, en, o) {
  const id = fieldId(path), code = (errors || {})[path];
  return `<div class="pf-f${code ? " pf-bad" : ""}" data-f="${esc(path)}"><label class="pf-opt" for="${id}"><input type="checkbox" id="${id}" name="${esc(path)}"${on ? " checked" : ""}${o.required ? ' aria-required="true"' : ""}${code ? ' aria-invalid="true"' : ""}${describedBy(path, !!o.help, code)}><span><b>${esc(o.title)}</b>${o.help ? `<span class="pf-oh" id="${id}-h">${esc(o.help)}</span>` : ""}</span></label>${errLine(path, code, en)}</div>`;
}

function aboutHTML(s, v) {
  const en = v.en, m = v.meta || {}, name = str(en ? (s.name_en || s.name_zh) : (s.name_zh || s.name_en)).trim();
  const photo = /^https:\/\//.test(str(m.photo_url))
    ? `<div class="pf-photo"><img src="${esc(m.photo_url)}" alt="${esc(t("photoAlt", en))}" width="72" height="72" loading="lazy" decoding="async"><p class="pf-h">${mail(t("photoHas", en))}</p></div>`
    : `<p class="pf-h pf-nophoto">${esc(t("photoNone", en))}</p>`;
  const saved = dateText(m.done_at, en);
  return `<div class="pf-hello">
      <p class="pf-hi">${esc(name ? t("hello", en, { name }) : t("helloPlain", en))}</p>
      <p>${esc(t("who", en))}</p><p>${esc(t("why", en))}</p><p>${esc(t("time", en))}</p><p>${esc(t("how", en))}</p>
      ${eventLines(m.events, en, m.now).map(x => `<p class="pf-ev">${esc(x)}</p>`).join("")}
      ${saved ? `<p class="pf-again">${esc(t("again", en, { date: saved }))}</p>` : ""}
    </div>
    <h3 class="pf-sub">${esc(t("nameH", en))}</h3>
    <p class="pf-h">${esc(t("nameLead", en))}</p>
    <div class="pf-grid">
      ${text("name_en", s, v.errors, en, { auto: "name", lang: "en", required: true })}
      ${text("name_zh", s, v.errors, en, { lang: "zh-Hant" })}
    </div>
    ${photo}
    <h3 class="pf-sub">${esc(t("whereH", en))}</h3>
    <div class="pf-grid">
      ${text("city", s, v.errors, en, { auto: "address-level2" })}
      ${text("country", s, v.errors, en, { auto: "country-name" })}
    </div>
    <h3 class="pf-sub">${esc(t("contactsH", en))}</h3>
    <p class="pf-h">${esc(t("contactsLead", en))}</p>
    <div class="pf-grid">
      ${text("contacts.email", s, v.errors, en, { type: "email", max: LIMITS.contact, auto: "email", mode: "email", plain: true, hint: t("emailHint", en), wide: true })}
      ${text("contacts.phone", s, v.errors, en, { type: "tel", max: LIMITS.contact, auto: "tel", mode: "tel", hint: t("phoneHint", en) })}
      ${text("contacts.linkedin", s, v.errors, en, { max: LIMITS.contact, mode: "url", plain: true })}
      ${text("contacts.ig", s, v.errors, en, { max: LIMITS.contact, plain: true })}
      ${text("contacts.line", s, v.errors, en, { max: LIMITS.contact, plain: true })}
      ${text("contacts.website", s, v.errors, en, { max: LIMITS.contact, auto: "url", mode: "url", plain: true, wide: true })}
    </div>`;
}

// 學歷或經歷的那一串。每一列一個 fieldset，底下一顆「拿掉這一筆」；整串底下一顆「加一筆」，滿十筆就換成一句話。
function rowsHTML(list, s, v) {
  const en = v.en, edu = list === "education", rows = s[list] || [];
  const body = rows.map((r, i) => {
    const at = k => `${list}.${i}.${k}`, n = i + 1;
    const f = (k, o) => field(at(k), r[k], v.errors, en, Object.assign({ label: lab(list + "." + k, en), max: LIMITS[k] || 4 }, o || {}));
    return `<fieldset class="pf-row"><legend>${esc(t(edu ? "eduRow" : "careerRow", en, { i: n }))}</legend>
      <div class="pf-grid">
        ${f("institution", { auto: "organization", wide: true })}
        ${edu ? f("title") + f("major") : f("title", { auto: "organization-title" })}
        ${f("year", { max: 4, mode: "numeric", hint: t(edu ? "eduYearHint" : "careerYearHint", en) })}
      </div>
      ${edu ? tick(at("enrolled"), r.enrolled === true, v.errors, en, { title: t("enrolled", en) }) : ""}
      <button type="button" class="pf-del" data-del="${list}.${i}" aria-label="${esc(t(edu ? "eduDel" : "careerDel", en, { i: n }))}">${esc(t("del", en))}</button>
    </fieldset>`;
  }).join("");
  const over = (v.errors || {})[list];
  return `<div class="pf-rows" id="pf-${list}">${body || `<p class="pf-h pf-empty">${esc(t(edu ? "eduEmpty" : "careerEmpty", en))}</p>`}</div>
    ${over ? `<p class="pf-err" role="alert">${mail(errorText(over, en))}</p>` : ""}
    ${rows.length >= LIMITS.rows ? `<p class="pf-h">${esc(t("rowsMax", en))}</p>` : `<button type="button" class="btn ghost pf-add" data-add="${list}">${esc(t(edu ? "eduAdd" : "careerAdd", en))}</button>`}`;
}
function educationHTML(s, v) {
  return `<p class="pf-lead">${esc(t("eduLead", v.en))}</p>
    ${text("school", s, v.errors, v.en, {})}
    <h3 class="pf-sub">${esc(t("eduH", v.en))}</h3>
    ${rowsHTML("education", s, v)}`;
}
function workHTML(s, v) {
  const en = v.en;
  return `<p class="pf-lead">${esc(t("workLead", en))}</p>
    <h3 class="pf-sub">${esc(t("nowH", en))}</h3>
    <div class="pf-grid">
      ${text("job_title", s, v.errors, en, { auto: "organization-title" })}
      ${text("job_org", s, v.errors, en, { auto: "organization" })}
      ${text("field", s, v.errors, en, { hint: t("fieldHint", en), wide: true })}
      ${text("bio", s, v.errors, en, { area: true, rows: 5, hint: t("bioHint", en), counter: true, wide: true })}
    </div>
    <h3 class="pf-sub">${esc(t("careerH", en))}</h3>
    ${rowsHTML("career", s, v)}`;
}
function storyHTML(s, v) {
  return `<p class="pf-lead">${esc(t("storyLead", v.en))}</p>
    ${STORY_KEYS.map(k => field("story." + k, s.story[k], v.errors, v.en, { label: STORY[k][v.en ? 1 : 0], max: LIMITS.story, area: true, rows: 5 })).join("")}`;
}
function consentHTML(s, v) {
  const en = v.en, m = v.meta || {}, one = k => tick(k, s[k] === true, v.errors, en, { title: CONSENT[k][en ? 1 : 0][0], help: CONSENT[k][en ? 1 : 0][1] });
  return `<p class="pf-lead">${esc(t("consentLead", en))}</p>
    ${m.done_at ? `<p class="pf-h">${esc(t("consentAgain", en))}</p>` : ""}
    <h3 class="pf-sub">${esc(t("mayH", en))}</h3>
    ${one("share_profile")}${one("share_story")}${one("contact_ok")}
    <h3 class="pf-sub">${esc(t("offerH", en))}</h3>
    ${one("offer_speak")}${one("offer_mentor")}
    <div class="pf-adult">
      ${tick("adult", s.adult === true, v.errors, en, { title: t("adult", en), help: t("adultHelp", en), required: true })}
      <p class="pf-h">${mail(t(m.self ? "laterSelf" : "later", en))}</p>
      <p class="pf-h">${esc(t("privacyPre", en))}<a href="../privacy/" target="_blank" rel="noopener">${esc(t("privacy", en))}</a>${esc(t("privacyPost", en))}</p>
    </div>`;
}
const STEP_HTML = [aboutHTML, educationHTML, workHTML, storyHTML, consentHTML];

// 上面那一排步驟：五顆可以直接點（回來只改一格的人不用一步一步按），現在這一步標 aria-current。
export function stepsHTML(step, en) {
  return `<nav class="pf-steps" aria-label="${esc(t("stepsNav", en))}"><ol>${STEPS.map((k, i) =>
    `<li><button type="button" data-go="${i + 1}"${i + 1 === step ? ' aria-current="step"' : ""}${i + 1 < step ? ' class="pf-past"' : ""}><b>${i + 1}</b><span>${esc(t("s_" + k, en))}</span></button></li>`).join("")}</ol></nav>
    <p class="pf-count">${esc(t("stepOf", en, { i: step, n: STEPS.length }))}</p>`;
}
// 整張表單（現在這一步）。v：{ step, en, errors, msg, busy, meta: { events, photo_url, expires_at, done_at, now } }
export function formHTML(state, view) {
  const v = Object.assign({ step: 1, en: false, errors: {}, msg: "", busy: false, meta: {} }, view || {});
  const step = Math.min(Math.max(Number(v.step) || 1, 1), STEPS.length), en = v.en, last = step === STEPS.length, s = state || blank();
  return `<h1>${esc(t("title", en))}</h1>
    ${selfBarHTML(v.meta, en)}
    ${stepsHTML(step, en)}
    <div id="pf-msg">${v.msg ? `<div class="warn" role="alert">${mail(v.msg)}</div>` : ""}</div>
    <form id="pf-form" class="pf-card" novalidate>
      <h2 id="pf-h" tabindex="-1">${esc(t("s_" + STEPS[step - 1], en))}</h2>
      ${STEP_HTML[step - 1](s, v)}
      <div class="pf-nav">
        ${step > 1 ? `<button type="button" class="btn ghost" data-nav="back"${v.busy ? " disabled" : ""}>${esc(t("back", en))}</button>` : ""}
        ${last ? `<button type="button" class="btn" data-nav="save"${v.busy ? " disabled" : ""}>${esc(t(v.busy ? "saving" : "save", en))}</button>`
               : `<button type="button" class="btn" data-nav="next">${esc(t("next", en))}</button>`}
      </div>
    </form>
    <p class="mini pf-keep">${esc(t("keep", en))}</p>`;
}

// 登入的人改自己的那一份（2027-01-25）：最上面一行說他登入了，兩條路回設定與活動。這一頁不載站內頂欄，所以路放在這裡。
export function selfBarHTML(meta, en) {
  if (!(meta && meta.self)) return "";
  return `<p class="pf-h pf-self">${esc(t("selfBar", en))} <a href="../settings/">${esc(t("settings", en))}</a> · <a href="../events/">${esc(t("events", en))}</a></p>`;
}
// 存好之後「你的帳號」那一塊（2027-01-25）。acc 是 rc_public_profile_account 回的 { state, email, code, sent }；登入的人是 { state: "self" }，不畫。
// code 只收資料庫發的那種形狀（bt- 加 8 個十六進位字元），其他一律不畫那顆鈕。
export function accountHTML(acc, en) {
  const a = acc || {}, st = a.state, email = str(a.email);
  if (!st || st === "self") return "";
  let body = "";
  if (st === "invited") {
    const go = /^bt-[0-9a-f]{8}$/.test(str(a.code)) ? `<p>${esc(t("accNow", en))}</p>
      <div class="pf-nav pf-accnav"><a class="btn" href="../app/?invite=${encodeURIComponent(a.code)}&amp;lang=${en ? "en" : "zh"}">${esc(t("accGo", en))}</a></div>
      <p class="pf-h">${esc(t("accHow", en, { email }))}</p>` : "";
    body = `<p>${esc(t(a.sent === false ? "accInvitedBefore" : "accInvited", en, { email }))}</p>${go}`;
  } else if (st === "has_account") body = `<p>${esc(t("accHas", en))}</p><div class="pf-nav pf-accnav"><a class="btn ghost" href="../app/">${esc(t("signIn", en))}</a></div>`;
  else if (st === "login") body = `<p>${esc(t("accLogin", en, { email }))}</p><div class="pf-nav pf-accnav"><a class="btn ghost" href="../app/">${esc(t("signIn", en))}</a></div>`;
  else if (st === "pending") body = `<p>${mail(t("accPending", en))}</p>`;
  else if (st === "no_email") body = `<p>${esc(t("accNoEmail", en))}</p>`;
  else body = `<p>${mail(t("accFail", en))}</p>`;
  return `<section class="pf-acc" aria-labelledby="pf-acc-h"><h2 id="pf-acc-h">${esc(t("accH", en))}</h2>${body}</section>`;
}
// 登入了，但拿不到自己的那一條：名單上沒有他（no_record）、他是幹部（not_for_cadre）、或別的原因。沒有表單。
export function noMineHTML(en, code) {
  if (code === "not_for_cadre") return `<div class="warn pf-wrong" role="alert">${esc(t("noMineCadre", en))} <a href="../settings/">${esc(t("settings", en))}</a></div>`;
  return `<div class="warn pf-wrong" role="alert">${mail(t("noMine", en))}</div>`;
}
// 存好之後：存了什麼、連結到哪一天、一顆回去改的按鈕。2027-01-25 起多「你的帳號」那一塊。
export function doneHTML(state, meta, en) {
  const s = state || blank(), m = meta || {}, name = [s.name_zh, s.name_en].map(x => str(x).trim()).filter(Boolean).join(" / ");
  const yes = FLAGS.filter(k => s[k] === true).map(k => CONSENT[k][en ? 1 : 0][0]);
  const until = dateText(m.expires_at, en);
  return `<div class="pf-card pf-done">
      <h1 id="pf-h" tabindex="-1">${esc(t("doneH", en))}</h1>
      ${/* 帳號放最上面：Paul 說這是這條連結最重要的一件事。 */ ""}${accountHTML(m.account, en)}
      <p>${esc(t("doneLead", en))}</p>
      <ul class="pf-sum">
        <li>${esc(t("doneName", en, { v: name }))}</li>
        <li>${esc(t("doneEdu", en, { n: rowsOut(s, "education").length }))}</li>
        <li>${esc(t("doneCareer", en, { n: rowsOut(s, "career").length }))}</li>
        <li>${esc(t("doneStory", en, { n: STORY_KEYS.filter(k => len(s.story[k]) > 0).length }))}</li>
      </ul>
      ${yes.length ? `<p>${esc(t("doneYes", en))}</p><ul class="pf-sum">${yes.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p>${esc(t("doneNone", en))}</p>`}
      ${m.self ? "" : `<p>${esc(until ? t("doneUntil", en, { date: until }) : t("doneLater", en))}</p>`}
      <p class="pf-h">${mail(t(m.self ? "laterSelf" : "later", en))}</p>
      <div class="pf-nav"><button type="button" class="btn" data-nav="edit">${esc(t("doneEdit", en))}</button><a class="btn ghost" href="../">${esc(t("home", en))}</a></div>
    </div>`;
}
// 連結不對、過期、被撤銷，或網址上根本沒有 token：一句話加 BT 的信箱，**沒有表單**。
export function wrongLinkHTML(en) { return `<div class="warn pf-wrong" role="alert">${mail(t("wrong", en))} ${esc(t("wrongLogin", en))} <a href="../app/">${esc(t("signIn", en))}</a></div>`; }
// 載不進來（資料庫連不上、沒有網路）：也沒有表單。
export function loadFailHTML(en, offline) { return `<div class="warn" role="alert">${mail(t(offline ? "loadOffline" : "loadFail", en))}</div>`; }
