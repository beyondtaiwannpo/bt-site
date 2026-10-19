// 實習護照的 App 邏輯：state、事件委派、跟 data.js / ui.js 對話。
// 從 passport/src/main.js 抄來，拿掉入境章、引導頁、匯出匯入、清除護照。
//
// 這一頁服務兩種人：
//   intern                     整本護照 + 進度牆
//   Internship team 的幹部與 Co-President（S.staff）  只有進度牆
// 其他人（學員、校友、別的 team 的幹部）在 boot() 就導去 /app/。
// 這裡的分流只決定畫哪個畫面，**讀得到什麼是資料庫 RLS 決定的**（2026-10-17-intern-passport.sql）。
import * as DATA from "./data.js";
import * as UI from "./ui.js";
import { navHTML } from "../../shared/nav.js";

let S = {
  user: null, role: null, staff: false, term: null,
  profile: null, tasks: [], stamps: {}, entries: {},
  page: 0, view: "passport", wall: null, wallLoading: false, wallError: false,
  down: false, justStamped: null, flipped: {}, justFlipped: null, tearing: null
};

function compress(file, maxDim, quality) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("read"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error("decode"));
      img.onload = () => {
        let { width: w, height: h } = img;
        const sc = Math.min(1, maxDim / Math.max(w, h));
        w = Math.round(w * sc); h = Math.round(h * sc);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        res(c.toDataURL("image/jpeg", quality));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

let toastT;
function toast(msg) {
  document.querySelectorAll(".toast").forEach(n => n.remove());
  const d = document.createElement("div");
  d.className = "toast"; d.textContent = msg; d.setAttribute("role", "status");
  document.body.appendChild(d);
  clearTimeout(toastT);
  toastT = setTimeout(() => d.remove(), 2600);
}

const root = () => document.getElementById("bt-root");

// 把人送去 /app/。replace 不留歷史，理由見 passport/src/main.js 的 toApp。
// ?next=intern-passport 是白名單的鑰匙（app/src/nav.js 的 NEXT），登入完直接回來。
function toApp() {
  const el = root();
  if (el) el.innerHTML = `<div class="empty">帶你去登入頁…</div>`;
  location.replace("../app/?next=intern-passport");
}

// 樣書用的 state：跟 S 共用 page 與 tasks，其他全是空的。
function sampleState() {
  return { ...S, sample: true, profile: UI.sampleProfile(S.term), stamps: {}, entries: {},
           flipped: {}, justStamped: null, justFlipped: null, tearing: null };
}

function render() {
  const el = root();
  if (S.down) { el.innerHTML = UI.downHTML(); return; }
  if (!S.user) { el.innerHTML = `<div class="empty">請先登入。<a href="../app/">去登入頁</a></div>`; return; }
  // ?bare=1（2026-10-19，Paul 拍板）：後台的預覽框用的，不畫頂欄與子欄。只改畫面，權限不變。
  const bare = new URLSearchParams(location.search).get("bare") === "1";
  const nav = bare ? "" : navHTML({ current: "intern-passport", role: S.role,
                        name: S.profile ? (S.profile.name_zh || S.profile.name_en) : "" });
  // Internship team 的幹部：牆，加「樣書」。樣書是同一套 bookHTML 畫的，
  // 只是把持照人換成假的、章與心得清空（S.sample 讓資料頁不畫編輯鈕）。
  // 不另外寫一份畫面：那會是第三份護照程式碼。
  if (S.staff) {
    el.innerHTML = nav + (bare ? "" : UI.barHTML(S)) + (S.view === "sample" ? UI.bookHTML(sampleState()) : UI.wallHTML(S));
    return;
  }
  // 不是 intern 也不是 staff 的人 boot() 已經導走，走到這裡就講一句話不要空白。
  // 條件是 S.role && ...：role 為 null（profiles 查不到）不要接住，那是資料壞掉不是身分問題。
  if (S.role && S.role !== "intern") { el.innerHTML = `<div class="empty">這裡只開放給 BT 的實習生。<a href="../app/">回到入口</a></div>`; return; }
  // intern 沒有護照那一列：身分那支遷移檔跑了、護照那支還沒跑的空窗。說清楚，不要給他一張填不進去的表單。
  if (!S.profile) { el.innerHTML = `<div class="card"><h2>護照還沒準備好</h2><div class="sub">你的帳號已經是實習生了，但護照那一頁的資料表還沒建好。請管理者跑完 2026-10-17 那支遷移檔，再重新整理。</div><div class="row"><button class="btn ghost sm" data-act="signout">登出</button></div></div>`; return; }
  if (!S.profile.name_zh && !S.profile.name_en) { el.innerHTML = UI.setupHTML(S.profile, S.user); return; }
  el.innerHTML = nav + (bare ? "" : UI.barHTML(S)) + (S.view === "wall" ? UI.wallHTML(S) : UI.bookHTML(S));
}

async function loadWall() {
  S.wallLoading = true; S.wallError = false; render();
  try { S.wall = await DATA.loadWall(); }
  catch (e) { console.error("進度牆讀取失敗：", e); S.wallError = true; }
  finally { S.wallLoading = false; render(); }
}

/* ---------- modal ---------- */
function openModal(id) {
  const a = S.tasks.find(x => x.id === id); if (!a) return;
  const st = S.stamps[id];
  const entry = S.entries[id] || {};
  const d = document.createElement("div");
  d.className = "scrim"; d.id = "scrim";
  d.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${UI.esc(a.title_zh)}">
    <div class="mt">${UI.esc(UI.CATNAME[a.category] || "")}</div>
    <h3>${UI.esc(a.title_zh)}</h3>
    <div style="font-size:10px;font-weight:600;letter-spacing:.14em;opacity:.45;text-transform:uppercase;margin-bottom:12px">${UI.esc(a.title_en)}</div>
    <p style="font-size:13.5px;opacity:.7;margin:0 0 18px">${UI.esc(a.description)}</p>
    <label><i>日期 / Date</i><input type="date" id="md" value="${UI.esc(st ? st.date : UI.today())}"></label>
    <label><i>一句話 / One line（選填，最多 60 字）</i><textarea id="mn" maxlength="60" placeholder="做了什麼、學到什麼？">${st ? UI.esc(entry.note || "") : ""}</textarea></label>
    <label><i>照片（選填，只存在你的護照裡）</i><input type="file" id="mf" accept="image/*"></label>
    <img class="prev" id="mp" src="${UI.esc(entry.photo || "")}" style="${entry.photo ? "" : "display:none"}" alt="">
    <div class="row" style="margin-top:14px">
      <button class="btn" data-act="stamp" data-id="${UI.esc(id)}">${st ? "更新" : "蓋章"}</button>
      <button class="btn ghost" data-act="close">取消</button>
      ${st ? `<button class="btn ghost sm" data-act="unstamp" data-id="${UI.esc(id)}" style="margin-left:auto">撕掉這格</button>` : ""}
    </div>
  </div>`;
  document.body.appendChild(d);
  d.addEventListener("click", e => { if (e.target === d) d.remove(); });
  const f = d.querySelector("#mf");
  f.addEventListener("change", async () => {
    const file = f.files && f.files[0]; if (!file) return;
    try {
      const url = await compress(file, 640, 0.68);
      const p = d.querySelector("#mp");
      p.src = url; p.style.display = "block"; p.dataset.new = "1";
    } catch (e) { toast("這張圖讀不到，換一張試試"); }
  });
  setTimeout(() => { const n = d.querySelector("#mn"); if (n) n.focus(); }, 30);
}

async function doStamp(id) {
  const d = document.getElementById("scrim"); if (!d) return;
  const date = d.querySelector("#md").value || UI.today();
  const note = d.querySelector("#mn").value.trim();
  const p = d.querySelector("#mp");
  const photo = (p.style.display !== "none" && p.src && p.src.startsWith("data:")) ? p.src : null;
  const fresh = !S.stamps[id];
  S.stamps[id] = { date };
  S.entries[id] = { note, photo };
  S.justStamped = fresh ? id : null;
  d.remove();
  render();
  try {
    await DATA.saveStamp(id, { date, note, photo });
    toast(fresh ? "蓋好了。" : "已更新。");
  } catch (e) {
    toast("沒有存起來，再試一次。");
  }
}

// 撕掉這格。三個觸發點共用（reduce 時直接、animationend、flush），
// 一次性保護是 S.stamps[id] 不在就不做事。失敗要把章放回去。
async function doUnstamp(id) {
  if (!S.stamps[id]) return;
  const stampBackup = S.stamps[id];
  const entryBackup = S.entries[id];
  delete S.stamps[id];
  delete S.entries[id];
  delete S.flipped[id];
  S.tearing = null;
  render();
  try {
    await DATA.removeStamp(id);
    toast("撕掉了。");
  } catch (e) {
    S.stamps[id] = stampBackup;
    S.entries[id] = entryBackup;
    render();
    toast("沒有存起來，再試一次。");
  }
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  if (S.tearing) doUnstamp(S.tearing);

  if (act === "signout") { await DATA.signOut(); location.replace("../app/"); return; }
  if (act === "tab") { S.view = b.dataset.v; render(); if (S.view === "wall" && !S.wall) loadWall(); return; }
  // 樣書上只能翻頁。蓋章、撕章、改資料都不是真的，按了就講一句。
  if (S.view === "sample" && ["open", "stamp", "unstamp", "edit", "flip"].includes(act)) { toast("這是樣書，看格子長什麼樣用的，蓋不了章。"); return; }
  if (act === "refresh") { loadWall(); return; }
  if (act === "prev") { S.page = Math.max(0, S.page - 1); render(); return; }
  if (act === "next") { S.page = Math.min(UI.pagesOf(S).length - 1, S.page + 1); render(); return; }
  if (act === "go") { S.page = Number(b.dataset.p); render(); return; }
  if (act === "flip") { S.flipped[b.dataset.id] = b.dataset.to; S.justFlipped = b.dataset.id; render(); return; }
  if (act === "open") { openModal(b.dataset.id); return; }
  if (act === "close") { const d = document.getElementById("scrim"); if (d) d.remove(); return; }
  if (act === "stamp") { doStamp(b.dataset.id); return; }

  if (act === "unstamp") {
    const id = b.dataset.id;
    if (!confirm("撕掉這格？日期、心得和照片都會不見。")) return;
    const d = document.getElementById("scrim"); if (d) d.remove();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { doUnstamp(id); return; }
    S.tearing = id;
    render();
    return;
  }

  if (act === "edit") { root().innerHTML = UI.setupHTML(S.profile, S.user); return; }
  if (act === "cancel") { render(); return; }

  if (act === "issue") {
    const name_zh = document.getElementById("fz").value.trim();
    const name_en = document.getElementById("fe").value.trim();
    if (!name_zh && !name_en) { toast("至少填一個名字"); return; }
    const p = { name_zh, name_en: name_en || name_zh, motto: document.getElementById("fm").value.trim() };
    try {
      await DATA.saveProfile(p);
      await boot();
      S.view = "passport"; S.page = 0;
      render();
      toast("護照領好了。");
    } catch (e) { toast("沒有存起來，再試一次。"); }
    return;
  }

  if (act === "retry") {
    S.down = false;
    root().innerHTML = `<div class="empty">正在重新連線…</div>`;
    await boot();
    return;
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { const d = document.getElementById("scrim"); if (d) d.remove(); return; }
  if (document.getElementById("scrim") || (!S.profile && S.view !== "sample")) return;
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (S.view !== "passport" && S.view !== "sample") return;
  if (S.tearing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) doUnstamp(S.tearing);
  if (e.key === "ArrowLeft" && S.page > 0) { S.page--; render(); }
  if (e.key === "ArrowRight" && S.page < UI.pagesOf(S).length - 1) { S.page++; render(); }
});

// 只認 tearL 這一個動畫名：兩半各觸發一次、其他動畫也會冒上來。
document.addEventListener("animationend", e => {
  if (!S.tearing || e.animationName !== "tearL") return;
  doUnstamp(S.tearing);
});

/* ---------- boot ---------- */
export async function boot() {
  try {
    const who = await DATA.currentUserDetailed();
    if (who.offline) { S.down = true; render(); return; }
    S.user = who.user;
    if (!S.user) { toApp(); return; }

    const slow = setTimeout(() => {
      const el = root();
      if (el) el.innerHTML = `<div class="empty">還在連資料庫…<br>如果一直停在這裡，可能是資料庫休眠了。</div>`;
    }, 2500);
    let all;
    try { all = await DATA.loadAll(); } finally { clearTimeout(slow); }

    // 整包裝進去，不要手寫逐欄指派（理由見 passport/src/main.js 的 boot）。
    Object.assign(S, all);
    // 不是 intern、也不是 Internship team 的幹部 → 回 /app/。
    // role 為 null 不導走：那是 profiles 查不到，跟「不是實習生」不是同一件事。
    if (S.role && S.role !== "intern" && !S.staff) { toApp(); return; }
    if (S.staff) {
      // ?view=sample&cat=project：後台的預覽框直接開在樣書的那一頁（2026-10-16）。
      // 只決定畫哪一頁，讀得到什麼仍然是 RLS 決定的。
      const q = new URLSearchParams(location.search);
      if (q.get("view") === "sample") { S.view = "sample"; S.page = UI.pageForCat(S, q.get("cat")); }
      else { S.view = "wall"; if (!S.wall) loadWall(); }
    }
    S.down = false;
    render();
  } catch (e) {
    if (DATA.sessionGone(e)) { await DATA.signOut(); toApp(); return; }
    console.error("載入失敗，畫面顯示的是「資料庫休眠中」那一頁。真正的原因：", e);
    S.down = true;
    render();
  }
}
boot();
