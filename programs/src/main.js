// /programs/（活動與計畫）：把「現在開放什麼」畫到頁面上。
//
// 這一頁沒有這支也看得完：四個計畫的說明、什麼時候開、怎麼被通知，全部寫在 HTML 裡。
// 這支只多做三件事：
//   1. 四張計畫卡裡，有開著的報名表的那一張變成「開放報名中」加一顆報名按鈕。
//   2. 沒開的卡寫上下一輪大約幾月。
//   3. 「辦過的活動」那一段：後台「網站上的活動」發布過、已經結束的活動（一年內的），一張也沒有就整段不出現。
// 現在報得了名的東西不畫在這一頁，那是頂欄第一個「現在開放」（/apply/）的事（Paul 2026-11-22）。
// 不載 supabase-js：只拿網址與公開金鑰，用 fetch 問兩次（跟首頁同一個做法），四秒內問不到就維持 HTML 原本的樣子。
// 誰都讀得到的只有「公開的活動」與「狀態是 open 的表單」，資料庫那邊擋著，這裡沒有也不需要登入。
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../../shared/supabase-config.js";
import { cardHTML, split } from "../../events/src/ui.js";
import { PROGS, statusByProg, nextTerm, termLabel, fmtDay } from "./logic.js";

const H = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };
const T = {
  zh: { apply: "報名", openTag: "開放報名中", until: d => `${d} 截止`, more: n => `有 ${n} 場近期活動` },
  en: { apply: "Sign up", openTag: "Open now", until: d => `closes ${d}`, more: n => `${n} upcoming event${n === 1 ? "" : "s"}` },
};

async function ask(path, init, signal) {
  const r = await fetch(SUPABASE_URL + path, { ...init, headers: H, signal });
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}

function paintProgs(status, upCount, now) {
  const month = nextTerm(now);
  for (const l of ["zh", "en"]) {
    const s = T[l], en = l === "en";
    for (const k of PROGS) {
      const card = document.querySelector(`.${l} .prog[data-prog="${k}"]`); if (!card) continue;
      const st = card.querySelector(".prog-st"), act = card.querySelector(".prog-act"), hit = status[k];
      if (hit) {
        st.textContent = s.openTag + (hit.form.closes_at ? "・" + s.until(fmtDay(hit.form.closes_at, en)) : ""); st.classList.add("on");
        act.innerHTML = `<a class="cta warm" href="../apply/?f=${encodeURIComponent(hit.form.id)}&lang=${l}">${s.apply}</a>`;
      } else if (k === "talks") {
        // 講座沒有「一輪」：有近期活動就指到「現在開放」那一頁的近期活動，沒有就維持 HTML 裡那句「場次先在 Instagram 公布」。
        if (upCount) { st.innerHTML = `<a href="../apply/?lang=${l}#upcoming">${s.more(upCount)}</a>`; st.classList.add("on"); }
      } else st.textContent = termLabel(month, en);
    }
  }
}

(async () => {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const [events, forms] = await Promise.all([
      ask("/rest/v1/rpc/public_events", { method: "POST", body: "{}" }, ctl.signal),
      ask("/rest/v1/forms?select=id,kind,title,intro,closes_at,opens_at,status&status=eq.open", { method: "GET" }, ctl.signal),
    ]);
    const now = new Date(), { upcoming: up, past } = split(events);
    paintProgs(statusByProg(forms, events, now), up.length, now);
    if (past.length) {
      for (const l of ["zh", "en"]) { const el = document.getElementById("past-" + l); if (el) el.innerHTML = `<div class="ev-cards">${past.map(e => cardHTML(e, l, `../events/?lang=${l}`)).join("")}</div>`; }
      for (const id of ["past", "past-en-sec"]) { const sec = document.getElementById(id); if (sec) sec.hidden = false; }
    }
    if (window.btRise) window.btRise(document);
  } catch (e) {
    console.warn("/programs/ 問不到現在開放什麼，維持頁面上原本的說明。", e);
  } finally { clearTimeout(timer); }
})();
