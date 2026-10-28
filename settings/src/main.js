// 設定頁的邏輯。
//
// **不 import passport/ 的任何東西**（跟 app/、admin/、availability/ 同一條規矩）。
// 圖片壓縮那一支是自己的一份 —— 護照壞掉不該讓人連改名字都改不了。
import { supabase } from "../../shared/supabase.js";
import * as AUTH from "../../shared/auth.js";
import { navHTML } from "../../shared/nav.js";
import * as UI from "./ui.js";
import { T, lang, setLang, pickLang, STORE_KEY } from "./strings.js";

// S.story：`null` 代表「還沒查」或「這個人沒有故事那一列」，`{}` 會讓人以為
// 查過了但是空的 —— 學員完全不會發那個查詢，所以 `null` 才是誠實的初始值。
let S = { user: null, me: null, story: null, down: false, busy: false, msg: "", view: "main" };
const root = () => document.getElementById("bt-root");

function render() {
  const el = root();
  if (!el) return;
  // ⚠ **頂欄要畫在 #bt-root 裡面**（見 admin/src/main.js 同一段註解）。
  // 畫在 <body> 上的話它吃不到 #bt-root 的左右內距，
  // 跟底下的內容就差 12px，Paul 2026-09-10 一眼看出來。
  const nav = navHTML({ current: "settings", lang: lang(),
    role: S.me && S.me.role, name: (S.me && (S.me.name_zh || S.me.name_en)) || "" });

  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.user) { location.replace("../app/?next=" + encodeURIComponent("/settings/")); return; }
  if (!S.me) { el.innerHTML = UI.downHTML(); return; }

  if (S.view === "delete") { el.innerHTML = nav + UI.deleteHTML(S.msg, S.busy); return; }
  el.innerHTML = nav + UI.settingsHTML(S.me, S.msg, S.busy, S.story);

  // 學校清單學員的 #school 跟幹部/校友「我的故事」那格的 #sschool 共用同一份
  // datalist，兩格都要點進去才載（2026-09-11：故事那一格也接上自動完成）。
  for (const id of ["school", "sschool"]) {
    const el2 = document.getElementById(id);
    if (el2) el2.addEventListener("focus", fillSchools, { once: true });
  }
}

let schoolsLoaded = false;
// 學校清單留一份在模組層，選高中要自動帶縣市（countyOf）才查得到。
let SCHOOLS = [];
async function fillSchools() {
  if (schoolsLoaded) return;
  schoolsLoaded = true;
  try {
    const res = await fetch("../app/schools.json");
    if (!res.ok) return;
    const data = await res.json();
    const dl = document.getElementById("schools");
    if (!dl || !data || !Array.isArray(data.schools)) return;
    SCHOOLS = data.schools;
    dl.innerHTML = data.schools
      .map(s => `<option value="${String(s.label).replace(/"/g, "&quot;")}"></option>`).join("");
  } catch (e) {
    // 載不到就是一個普通的文字欄位，**不要對他說任何話** —— 對他來說沒有壞掉。
    // 「我的故事」那一格的縣市也不會被自動帶出來，但他自己選得了。
    console.warn("學校清單載不到，那一格照樣可以自己打字。", e);
  }
}

// 選了高中就把縣市帶出來。**只在縣市還空著的時候帶** ——
// 蓋掉他自己選的那一個會很嚇人，尤其是高中在新北、起飛點要選台北的人。
// 對不上就不動，那一格他自己選得了。
function countyOf(label) {
  const hit = (SCHOOLS || []).find(s => s.label === label);
  if (!hit) return "";
  const c = String(hit.county || "").replace(/[市縣]$/, "").replace(/^臺/, "台");
  if (c === "新北") return "台北";           // 圖上沒有新北，起飛點畫在台北
  return UI.COUNTIES.includes(c) ? c : "";
}

// 高中那一格是自動完成，**change 才是「選定」的時機**（不是 input，
// 打字過程每個字都會觸發 input，那時候還沒選好）。
document.addEventListener("change", e => {
  if (!e.target || e.target.id !== "sschool") return;
  const sel = document.getElementById("scounty");
  if (!sel || sel.value) return;          // 他自己選過就不要蓋掉
  const c = countyOf(e.target.value);
  if (!c) return;
  sel.value = c;
  // 2026-11-06 自動儲存：程式幫他選的縣市不會自己觸發 change，補發一次，
  // 不然高中存了、縣市要等他再改別格才會跟著存。
  sel.dispatchEvent(new Event("change", { bubbles: true }));
});

// 版本提示（2026-11-06，後台速度）：開頁問一次線上的 version.json（cache: no-store，繞過 GitHub Pages 的 10 分鐘快取），
// 跟這一頁載進來的 <meta name="bt-version"> 不一樣就在左下角掛一條「有新版本，重新整理」，不會自己消失。
// 讀不到就不提。後台那四份在 ui.js（checkVersion），這幾個資料夾各自一份一樣的。
export function versionDiffers(loaded, live) { return !!loaded && !!live && String(loaded) !== String(live); }
async function checkVersion(rootUrl) {
  if (typeof fetch === "undefined" || typeof document === "undefined") return false;
  try {
    const meta = document.querySelector('meta[name="bt-version"]');
    const r = await fetch(`${rootUrl}version.json`, { cache: "no-store" });
    if (!r.ok) return false;
    const j = await r.json();
    if (!versionDiffers(meta ? meta.content : "", j && j.v)) return false;
    document.querySelectorAll(".verbar").forEach(n => n.remove());
    const d = document.createElement("div");
    d.className = "verbar"; d.setAttribute("role", "status");
    d.innerHTML = `<span></span><button type="button" class="btn"></button>`;
    d.querySelector("span").textContent = T("ver.newer");
    const b = d.querySelector("button"); b.textContent = T("ver.reload"); b.addEventListener("click", () => location.reload());
    document.body.appendChild(d);
    return true;
  } catch (e) { return false; }
}

async function boot() {
  checkVersion("../");
  // 自動儲存掛一次在 #bt-root 上（它不會被換掉，裡面的 innerHTML 才會）。
  UI.bindAutosave(root(), onAutosave);
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { render(); return; }
    // ★ 這兩張表同時查，不要排隊。兩個要的都只有 S.user.id，已經在手上了。
    // 原本是等 profiles 回來看完角色才去查故事，白白多一趟往返
    //（實測到 Supabase 一趟熱的約 100 到 240 毫秒）。
    //
    // ⚠ 為什麼一定要用 Promise.all，不能只是先塞進變數：supabase 的查詢建構器
    // 是**懶的**，它的 then() 裡面才真的去 fetch（vendor/supabase-js.js 裡讀得到）。
    // 只是塞進變數的話那一句根本還沒送出去，寫起來像同時發、跑起來還是接力。
    //
    // ⚠ 學員沒有「我的故事」這一區，所以對學員來說這是一個多發的查詢
    //（RLS 會擋掉，回來是空的）。換到的是幹部與校友每次都少一趟往返。
    const storyQ = supabase.from("alumni_stories")
      .select("display_name, school, county, city, country, place, quote, note, " +
              "school_en, country_en, quote_en, note_en, public_story, story_approved, updated_at")
      .eq("id", S.user.id).maybeSingle();
    // ⚠⚠ 故事這一份要先把例外收成 { data, error }，**不能讓它 reject**。
    // 下面那句 warn 的意思是「讀不到故事不擋整頁，姓名與大頭照照樣要改得動」，
    // 而 Promise.all 只要有一個 reject 就整個 reject —— 不收的話，
    // 故事表一出問題，整個設定頁會變成「資料庫休眠中」，那是行為的倒退。
    // 2026-11-06 後台速度：原本四層（profiles → my_access → terms → positions），現在一層全部同時發。
    //   - 「我是誰」走 shared/auth.js 的 whoAmI(…, true)：fresh，**這一頁不吃分頁快取**，因為它就是改自己資料的地方，
    //     要看到的是資料庫現在的值；查完它會把新值寫回快取，別的頁面接著用。
    //   - terms 與 positions 不用等 profiles：positions 的 RLS 只給自己那幾列，先全拿回來再挑這一屆的。
    //     學員會多發這兩個查詢（RLS 擋掉，回來是空的），換到的是幹部每次少兩趟往返。
    const [whoRes, storyRes, termRes, posRes] = await Promise.all([
      AUTH.whoAmI(S.user.id, true),
      Promise.resolve(storyQ).catch(err => ({ data: null, error: err })),
      Promise.resolve(supabase.from("terms").select("id").eq("status", "current").maybeSingle()).catch(() => ({ data: null })),
      Promise.resolve(supabase.from("positions").select("title_zh, title_en, term_id")).catch(() => ({ data: null })),
    ]);
    S.me = { ...(whoRes.row || {}), email: S.user.email };
    // 2026-10-24：幹部多讀兩樣，都是「有就有、沒有也不擋整頁」：
    //   - 我被派進哪幾個工作區（my_access()），決定要不要畫「實習生的進度牆」那顆按鈕；
    //   - 這一屆我的職位（positions，RLS 只給自己那幾列），團隊頁印的頭銜就是它，這裡只顯示不給改。
    if (S.me.role === "cadre") {
      S.me.ws = whoRes.ws || {};
      const term = termRes && termRes.data;
      const pos = term ? ((posRes && posRes.data) || []).find(p => p.term_id === term.id) : null;
      S.me.title = term && pos ? `${pos.title_en || pos.title_zh || ""} · ${term.id}` : "";
    }
    // 「我的故事」是另一張表。學員沒有這一區，所以查回來的東西直接丟掉。
    if (S.me.role === "cadre" || S.me.role === "alumni") {
      const { data: st, error: e2 } = storyRes;
      // 讀不到故事**不擋整頁**：姓名與大頭照照樣要改得動。
      if (e2) console.warn("故事讀不到，先當作還沒填：", e2);
      S.story = st || null;
    }
    render();
  } catch (e) {
    // 票已經不能用了（帳號被停用、或伺服器換過簽章金鑰）。開機改用本機 session
    // 之後就沒有人在開機時問伺服器「這個帳號還有效嗎」了，所以這種人會一路走到
    // 這裡才被擋下來（理由與取捨見 shared/auth.js 的 currentUserDetailed）。
    // **不能讓他看到「資料庫休眠中」**：資料庫是好的，是他的票沒了，
    // 而那個畫面不會叫他重新登入，他會一直重整。
    // 先清掉本機那張壞票再走，不清的話下一頁讀出來的還是它。
    if (AUTH.sessionGone(e)) { await AUTH.signOut(); location.replace("../app/?next=" + encodeURIComponent("/settings/")); return; }
    console.error("/settings/ 載入失敗：", e);
    S.down = true; render();
  }
}

// 圖片壓縮。**自己的一份**（不 import passport/）。
// 420px、品質 0.7 —— 跟護照那邊同一組數字，因為存的是同一欄。
// 改這裡的話那邊也要改，不然同一個人的大頭照會因為從哪裡上傳而不一樣大。
// 把選到的照片縮小、壓成一段 data URL 存進 profiles.avatar。
//
// ⚠ **有透明背景的照片不能存成 jpeg。** jpeg 沒有透明這回事，
// 存下去透明的地方會變成黑色 —— 一張去背照上傳完會變成一個黑色方塊裡的人。
// 這不是理論上的問題：/team/ 的「頭超出卡片」就是靠去背照做的，
// 幹部拍完去背照第一件事就是從這裡上傳。
//
// 所以先看有沒有透明像素：
//   有 → 存 webp（有透明、又比 png 小很多），瀏覽器不支援 webp 就退回 png。
//   沒有 → 存 jpeg，跟以前一樣。
// **圖檔格式本身就是「這是不是去背照」的標記**，不用多開一個資料庫欄位，
// 也不用要求誰記得去勾一個框（見 team/src/ui.js 的 toPerson）。
function compress(file, maxDim, quality) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("read"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error("decode"));
      img.onload = () => {
        let { width: w, height: h } = img;
        // 去背照是直的、而且會被放到比大頭照大，所以留多一點解析度。
        // 但要先畫過一次才知道有沒有透明，這裡先用原圖的比例判斷不了，
        // 所以一律用比較大的那個上限畫，jpeg 那條路再縮回去。
        const cap = Math.max(maxDim, CUT_MAX);
        const sc = Math.min(1, cap / Math.max(w, h));
        w = Math.round(w * sc); h = Math.round(h * sc);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        if (hasAlpha(ctx, w, h)) {
          const webp = c.toDataURL("image/webp", 0.82);
          res(/^data:image\/webp/.test(webp) ? webp : c.toDataURL("image/png"));
          return;
        }
        // 不透明：縮回一般大頭照的尺寸再存 jpeg。
        const sc2 = Math.min(1, maxDim / Math.max(w, h));
        if (sc2 < 1) {
          const c2 = document.createElement("canvas");
          c2.width = Math.round(w * sc2); c2.height = Math.round(h * sc2);
          c2.getContext("2d").drawImage(c, 0, 0, c2.width, c2.height);
          res(c2.toDataURL("image/jpeg", quality));
          return;
        }
        res(c.toDataURL("image/jpeg", quality));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

// 去背照的長邊上限。比大頭照大，因為它在 /team/ 上會被放到接近 200px 高，
// 而那些螢幕多半是兩倍解析度。
const CUT_MAX = 560;

// 有沒有任何一個像素是半透明的。
// **門檻用 250 不是 255**：有些去背工具的邊緣會留下 254 這種幾乎不透明的值，
// 而且 jpeg 來源解碼出來一律是 255，不會誤判。
function hasAlpha(ctx, w, h) {
  try {
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  } catch (e) {
    // 讀不到像素（理論上不會，來源是 data URL 不會污染 canvas）就當作不透明。
    return false;
  }
  return false;
}

const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : null; };

// 勾起來的 team 收成一個逗號字串（2026-09-10，一個人可以在好幾個 team）。
// 一個都沒勾的話回空字串，上面會轉成 null —— **不要回一個逗號**，
// 那會讓那個人在畫面上多出一個沒有名字的 team。
function pickedTeams() {
  const boxes = document.querySelectorAll('input[name="team"]:checked');
  return [...boxes].map(b => b.value.trim()).filter(Boolean).join(", ");
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;

  if (act === "retry") { location.reload(); return; }
  if (act === "lang") { switchLang(b.dataset.lang); return; }
  if (act === "signout") { await AUTH.signOut(); location.replace("../app/"); return; }
  if (act === "back") { S.view = "main"; S.msg = ""; render(); return; }
  if (act === "ask-delete") { S.view = "delete"; S.msg = ""; render(); return; }

  if (act === "avatar") {
    // ⚠ **在開檔案選擇器之前問**（規格 §6.2）。挑完照片才問等於
    // 「都選好了，不上傳很可惜」—— 那不是同意，是沉沒成本。
    const extra = S.me.public_profile ? T("m.avatarExtra") : "";
    if (!confirm(T("m.avatarConfirm", { extra }))) return;
    const i = document.createElement("input");
    i.type = "file"; i.accept = "image/*";
    i.onchange = async () => {
      const f = i.files && i.files[0];
      if (!f) return;
      let url;
      try { url = await compress(f, 420, 0.7); }
      catch (err) { S.msg = T("m.imgFail"); render(); return; }
      S.busy = true; S.msg = ""; S.me.avatar = url; render();
      try {
        const { error } = await supabase.from("profiles").update({ avatar: url }).eq("id", S.user.id);
        if (error) throw error;
        AUTH.forgetMe();
        S.busy = false; S.msg = T("m.avatarOk");
      } catch (err) { S.busy = false; S.msg = T("m.avatarFail") + (err.message || err); }
      render();
    };
    i.click();
    return;
  }

  // 2026-11-06：「存起來」那顆鈕沒有了，存檔走下面的 onAutosave（每一格改了就存）。

  if (act === "do-delete") {
    if (!UI.typedDelete(val("dc"))) { S.msg = T("m.typeDelete"); render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      // 帳號沒了，本機的 session 也要清掉，不然下一次載入會拿著一張
      // 指向不存在的人的票。
      await AUTH.signOut();
      location.replace("../");
    } catch (err) {
      S.busy = false; S.msg = T("m.delFail") + (err.message || err); render();
    }
    return;
  }
});

// ── 自動儲存（2026-11-06，Paul：「希望每一格都像 Workspaces 那一頁一樣，改了就存」）──
// 兩個容器各自存：data-autosave="profile" 存 profiles、data-autosave="story" 存 alumni_stories。
// 讀欄位仍然照 id（val / pickedTeams / getElementById），不用 formValues：team 那幾個 checkbox 同名，
// formValues 會把它們收成一個布林，而 pickedTeams() 本來就是為這件事寫的。
//
// ⚠ **三種人，不是兩種**（總審查 C1，2026-09-11）。原本只有
// cadre / 不是 cadre 兩分法，校友掉進「不是 cadre」那一條，
// 那一條問的是「姓名、學校、年級」——校友的畫面上根本沒有那三格，
// 於是校友的故事一個字都存不進去。ui.js 已經是三分法，這裡要跟上。
//
// **只送這一頁真的有那一格的欄位。** 多送一個沒有權限的欄位，
// 整句 update 都會被拒（2026-09-01 profiles.team 那個坑）。
//
// ⚠ **三條路各寫一句字面的 update，不要組一個 patch 物件再送。**
// check.sh 有一條守門在對「前端寫進 profiles 的欄位」與資料庫發出去的
// 欄位權限，而它是用比對式讀原始碼的 —— `.update(patch)` 它看不懂，
// 會靜靜地漏掉這幾條寫入路徑。**寫成看得懂的樣子，是為了讓守門守得到。**
//
// 存成功**不 render()**：使用者可能還在打字，畫面上已經是他打的字。只換兩個小地方的字
//（公開勾選底下那兩句 data-pub-note、故事狀態那一句 data-story-status）加左下角一條 toast。
// 存失敗也不重畫、不清欄位，小字變「沒存進去」，再改一下就會再存一次。
const dirty = UI.dirtyTracker();
async function onAutosave(act, box) {
  if (!S.user || !S.me) return;
  const cadre = S.me.role === "cadre";
  const alumni = S.me.role === "alumni";
  // 2026-10-17：實習生的「我的資料」跟校友一樣只有中英文名兩格，存檔走校友那一句；
  // 但他沒有「我的故事」，那個容器根本不畫。
  const intern = S.me.role === "intern";
  const key = act + ":" + S.user.id;

  if (act === "profile") {
    let patch;
    if (cadre) {
      patch = {
        name_zh: val("nzh") || null,
        name_en: val("nen") || null,
        // 2026-10-24 起 team 只是標籤，每個人自己勾。頭銜從後台的職位算，這裡不再送 public_title。
        team: pickedTeams() || null,
        public_profile: !!(document.getElementById("pub") || {}).checked,
      };
    } else if (alumni || intern) {
      // 校友的「我的資料」只有中文姓名與英文姓名兩格（ui.js 同一份改動）。
      // 不問學校、年級——那是問高中生的，校友的故事已經在下面另一張表裡。
      patch = {
        name_zh: val("nzh") || null,
        name_en: val("nen") || null,
      };
    } else {
      const name = val("nzh"), school = val("school"), grade = val("grade");
      // 學員三格必填，少一格就不存（照舊）。小字變「沒存進去」加一句說哪三格，他填齊下一格就會再存。
      if (!name || !school || !grade) { UI.autosaveState(box, "failed"); UI.toast(T("m.three")); return; }
      patch = {
        name_zh: name,
        school: school,
        grade: grade,
        newsletter_opt_in: !!(document.getElementById("nl") || {}).checked,
      };
    }
    const fp = JSON.stringify(patch);
    if (!dirty.changed(key, fp)) return;          // 值沒變就不送（離開欄位又停 800 毫秒會觸發兩次）
    UI.autosaveState(box, "saving");
    try {
      const { error } = cadre
        ? await supabase.from("profiles").update({
            name_zh: patch.name_zh, name_en: patch.name_en, team: patch.team,
            public_profile: patch.public_profile,
          }).eq("id", S.user.id)
        : (alumni || intern)
        ? await supabase.from("profiles").update({
            name_zh: patch.name_zh, name_en: patch.name_en,
          }).eq("id", S.user.id)
        : await supabase.from("profiles").update({
            name_zh: patch.name_zh, school: patch.school, grade: patch.grade,
            newsletter_opt_in: patch.newsletter_opt_in,
          }).eq("id", S.user.id);
      if (error) throw error;
      dirty.mark(key, fp);
      S.me = { ...S.me, ...patch };
      AUTH.forgetMe(); // 名字、team、公開勾選改了，別的頁面的側欄要跟著變
      const note = box.querySelector("[data-pub-note]");
      if (note) note.innerHTML = UI.pubNote(S.me);
      UI.autosaveState(box, "saved");
      const notes = [];
      if (cadre && patch.public_profile && !S.me.public_approved) notes.push(T("m.pendingTeam"));
      UI.toast(T("m.saved", { notes: notes.join(T("punct.sent")) }).trim());
    } catch (err) {
      // ⚠ 失敗一定要說話。存檔失敗卻畫出一模一樣的畫面，使用者會再改一次。
      console.error("設定頁自動存檔失敗（我的資料）：", err);
      UI.autosaveState(box, "failed");
      UI.toast(UI.saveFailMessage(false, err));
    }
    return;
  }

  if (act === "story" && (cadre || alumni)) {
    // 「我的故事」。**另一張表，所以是獨立的 API 呼叫。**學員與實習生沒有這一區。
    const fields = {
      display_name: val("sname") || null,
      school: val("sschool") || null,
      county: (document.getElementById("scounty") || {}).value || null,
      city: val("scity") || null,
      country: val("scountry") || null,
      place: val("splace") || null,
      quote: val("squote") || null,
      note: val("snote") || null,
      school_en: val("sschoolen") || null,
      country_en: val("scountryen") || null,
      quote_en: val("squoteen") || null,
      note_en: val("snoteen") || null,
      public_story: !!(document.getElementById("spub") || {}).checked,
    };
    // 勾了同意才要求填齊。還沒勾的人是在慢慢填，不要擋他存檔。
    const missing = UI.storyMissing(fields);
    if (fields.public_story && missing.length) {
      UI.autosaveState(box, "failed");
      UI.toast(T("m.storyMissing") + missing.join(T("punct.list")));
      return;
    }
    const ff = JSON.stringify(fields);
    if (!dirty.changed(key, ff)) return;
    UI.autosaveState(box, "saving");
    // ⚠ **不可以用 .upsert()**：alumni_stories 是欄位層級授權，id 只有
    // INSERT 權限、沒有 UPDATE 權限（Task 4 的遷移檔刻意這樣發，本人才
    // 改不動「這是誰的故事」）。upsert 展開成
    // `insert ... on conflict (id) do update set <payload 每一欄>`，
    // id 會被塞進那份 SET 清單，整句被資料庫拒絕 —— 症狀是「存了，
    // 畫面什麼都沒發生」，這個 repo 2026-09-02 已經被同一件事咬過一次
    // （時間看板的知情同意按鈕）。所以分成兩條明確的路：
    // boot() 已經知道有沒有那一列（S.story 是 null 或物件）。
    // 兩句都寫成字面物件，理由跟上面 profiles 那幾句一樣 ——
    // check.sh 的欄位對帳守門是用比對式讀原始碼的，讀得懂才守得到。
    try {
      const { error: e3 } = S.story
        ? await supabase.from("alumni_stories").update({
            display_name: fields.display_name, school: fields.school, county: fields.county,
            city: fields.city, country: fields.country, place: fields.place,
            quote: fields.quote, note: fields.note,
            school_en: fields.school_en, country_en: fields.country_en,
            quote_en: fields.quote_en, note_en: fields.note_en,
            public_story: fields.public_story,
          }).eq("id", S.user.id)
        : await supabase.from("alumni_stories").insert({
            id: S.user.id,
            display_name: fields.display_name, school: fields.school, county: fields.county,
            city: fields.city, country: fields.country, place: fields.place,
            quote: fields.quote, note: fields.note,
            school_en: fields.school_en, country_en: fields.country_en,
            quote_en: fields.quote_en, note_en: fields.note_en,
            public_story: fields.public_story,
          });
      if (e3) throw e3;
      dirty.mark(key, ff);
      // insert 成功之後 S.story 會變成物件，同一次載入裡再改一格就會走 update 那條，正確。
      // 改了那一句話或介紹，資料庫那邊的 trigger 會把 story_approved 放掉（等重新核可）；
      // 這裡不猜它的值，只在勾了同意的時候把狀態那一句改成「已送出，等核可」。
      S.story = { ...(S.story || {}), ...fields };
      if (fields.public_story) S.story.story_approved = false;
      const st = box.querySelector("[data-story-status]");
      if (st) st.textContent = UI.storyStatus(S.story);
      UI.autosaveState(box, "saved");
      const notes = [];
      if (S.story.public_story && !S.story.story_approved) notes.push(T("m.pendingStory"));
      UI.toast(T("m.saved", { notes: notes.join(T("punct.sent")) }).trim());
    } catch (err) {
      console.error("設定頁自動存檔失敗（我的故事）：", err);
      UI.autosaveState(box, "failed");
      UI.toast(UI.saveFailMessage(false, err));
    }
  }
}

// 語言（2026-10-19 中英切換，做法見 docs/2026-10-19-後台中英切換.md）。
// 開頁：網址 ?lang= 先、再上次存在 localStorage 的、都沒有就英文（Paul 拍板預設英文）。
// 切換：改字典的語言、存起來、把 ?lang= 寫進網址、重畫。**不重新載入頁面**。
function readStored() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
function applyLang(l) {
  setLang(l);
  document.documentElement.lang = lang() === "zh" ? "zh-Hant" : "en";
}
function switchLang(l) {
  applyLang(l);
  try { localStorage.setItem(STORE_KEY, lang()); } catch (e) { /* 無痕視窗存不了，這一頁照樣切 */ }
  const u = new URL(location.href); u.searchParams.set("lang", lang());
  history.replaceState(null, "", u.pathname + u.search + u.hash);
  render();
}
applyLang(pickLang(location.search, readStored()));
boot();
