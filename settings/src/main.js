// 設定頁的邏輯。
//
// **不 import passport/ 的任何東西**（跟 app/、admin/、availability/ 同一條規矩）。
// 圖片壓縮那一支是自己的一份 —— 護照壞掉不該讓人連改名字都改不了。
import { supabase } from "../../shared/supabase.js";
import * as AUTH from "../../shared/auth.js";
import { navHTML } from "../../shared/nav.js";
import * as UI from "./ui.js";

let S = { user: null, me: null, down: false, busy: false, msg: "", view: "main" };
const root = () => document.getElementById("bt-root");

function render() {
  const el = root();
  if (!el) return;
  // ⚠ **頂欄要畫在 #bt-root 裡面**（見 admin/src/main.js 同一段註解）。
  // 畫在 <body> 上的話它吃不到 #bt-root 的左右內距，
  // 跟底下的內容就差 12px，Paul 2026-09-10 一眼看出來。
  const nav = navHTML({ current: "settings",
    role: S.me && S.me.role, name: (S.me && (S.me.name_zh || S.me.name_en)) || "" });

  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.user) { location.replace("../app/?next=" + encodeURIComponent("/settings/")); return; }
  if (!S.me) { el.innerHTML = UI.downHTML(); return; }

  if (S.view === "delete") { el.innerHTML = nav + UI.deleteHTML(S.msg, S.busy); return; }
  el.innerHTML = nav + UI.settingsHTML(S.me, S.msg, S.busy);

  // 學校清單只在學員那一頁用得到，而且是點進那一格才載。
  const sc = document.getElementById("school");
  if (sc) sc.addEventListener("focus", fillSchools, { once: true });
}

let schoolsLoaded = false;
async function fillSchools() {
  if (schoolsLoaded) return;
  schoolsLoaded = true;
  try {
    const res = await fetch("../app/schools.json");
    if (!res.ok) return;
    const data = await res.json();
    const dl = document.getElementById("schools");
    if (!dl || !data || !Array.isArray(data.schools)) return;
    dl.innerHTML = data.schools
      .map(s => `<option value="${String(s.label).replace(/"/g, "&quot;")}"></option>`).join("");
  } catch (e) {
    // 載不到就是一個普通的文字欄位，**不要對他說任何話** —— 對他來說沒有壞掉。
    console.warn("學校清單載不到，那一格照樣可以自己打字。", e);
  }
}

async function boot() {
  try {
    const who = await AUTH.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { render(); return; }
    const { data, error } = await supabase.from("profiles")
      .select("role, name_zh, name_en, team, avatar, school, grade, newsletter_opt_in, " +
              "public_profile, public_approved, public_title")
      .eq("id", S.user.id).maybeSingle();
    if (error) throw error;
    S.me = { ...(data || {}), email: S.user.email };
    render();
  } catch (e) {
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
  if (act === "signout") { await AUTH.signOut(); location.replace("../app/"); return; }
  if (act === "back") { S.view = "main"; S.msg = ""; render(); return; }
  if (act === "ask-delete") { S.view = "delete"; S.msg = ""; render(); return; }

  if (act === "avatar") {
    // ⚠ **在開檔案選擇器之前問**（規格 §6.2）。挑完照片才問等於
    // 「都選好了，不上傳很可惜」—— 那不是同意，是沉沒成本。
    const extra = S.me.public_profile
      ? "，而且因為你勾了公開，它也會出現在任何人都看得到的團隊頁上"
      : "";
    if (!confirm(`你的大頭照會出現在全體進度牆上，其他 BT 幹部看得到${extra}。要繼續上傳嗎？`)) return;
    const i = document.createElement("input");
    i.type = "file"; i.accept = "image/*";
    i.onchange = async () => {
      const f = i.files && i.files[0];
      if (!f) return;
      let url;
      try { url = await compress(f, 420, 0.7); }
      catch (err) { S.msg = "這張圖讀不到，換一張試試。"; render(); return; }
      S.busy = true; S.msg = ""; S.me.avatar = url; render();
      try {
        const { error } = await supabase.from("profiles").update({ avatar: url }).eq("id", S.user.id);
        if (error) throw error;
        S.busy = false; S.msg = "換好了。";
      } catch (err) { S.busy = false; S.msg = "大頭照沒有存起來：" + (err.message || err); }
      render();
    };
    i.click();
    return;
  }

  if (act === "save") {
    const cadre = S.me.role === "cadre";
    // **只送這一頁真的有那一格的欄位。** 多送一個沒有權限的欄位，
    // 整句 update 都會被拒（2026-09-01 profiles.team 那個坑）。
    //
    // ⚠ **兩條路各寫一句字面的 update，不要組一個 patch 物件再送。**
    // check.sh 有一條守門在對「前端寫進 profiles 的欄位」與資料庫發出去的
    // 欄位權限，而它是用比對式讀原始碼的 —— `.update(patch)` 它看不懂，
    // 會靜靜地漏掉這兩條寫入路徑。**寫成看得懂的樣子，是為了讓守門守得到。**
    let patch;
    if (cadre) {
      patch = {
        name_zh: val("nzh") || null,
        name_en: val("nen") || null,
        team: pickedTeams() || null,
        public_profile: !!(document.getElementById("pub") || {}).checked,
        public_title: document.getElementById("ptitle") ? (val("ptitle") || null) : S.me.public_title,
      };
    } else {
      const name = val("nzh"), school = val("school"), grade = val("grade");
      if (!name || !school || !grade) { S.msg = "姓名、學校、年級三個都要填。"; render(); return; }
      patch = {
        name_zh: name,
        school: school,
        grade: grade,
        newsletter_opt_in: !!(document.getElementById("nl") || {}).checked,
      };
    }
    S.busy = true; S.msg = ""; render();
    try {
      const { error } = cadre
        ? await supabase.from("profiles").update({
            name_zh: patch.name_zh, name_en: patch.name_en, team: patch.team,
            public_profile: patch.public_profile, public_title: patch.public_title,
          }).eq("id", S.user.id)
        : await supabase.from("profiles").update({
            name_zh: patch.name_zh, school: patch.school, grade: patch.grade,
            newsletter_opt_in: patch.newsletter_opt_in,
          }).eq("id", S.user.id);
      if (error) throw error;
      S.me = { ...S.me, ...patch };
      S.busy = false;
      S.msg = cadre && patch.public_profile && !S.me.public_approved
        ? "存好了。公開那一項還要等 Co-President 核可才會出現。"
        : "存好了。";
    } catch (err) {
      // ⚠ 失敗一定要說話。存檔失敗卻畫出一模一樣的畫面，使用者會再按一次。
      S.busy = false; S.msg = "存不起來：" + (err.message || err);
    }
    render();
    return;
  }

  if (act === "do-delete") {
    if (val("dc") !== "刪除") { S.msg = "要在那一格打「刪除」兩個字才會執行。"; render(); return; }
    S.busy = true; S.msg = ""; render();
    try {
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      // 帳號沒了，本機的 session 也要清掉，不然下一次載入會拿著一張
      // 指向不存在的人的票。
      await AUTH.signOut();
      location.replace("../");
    } catch (err) {
      S.busy = false; S.msg = "刪不掉：" + (err.message || err); render();
    }
    return;
  }
});

boot();
