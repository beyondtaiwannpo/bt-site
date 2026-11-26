// /team/ 最上面那一排大照片：一張一個 team，往左右滑就換一個 team，下面那一塊跟著換。
//
// 捲動本身是瀏覽器做的（CSS scroll-snap）：手機上用手指滑，不需要這支檔。
// 這支只做三件事：
//   1. 滑到哪一張，就把 <html data-tm="那個 team"> 改掉。下面六塊介紹裡哪一塊出現是 CSS 照這個屬性決定的。
//   2. 箭頭、照片下面那六格、鍵盤左右鍵：捲到那一張。
//   3. 網址的 #代號（例如 /team/#mentorship）直接開那個 team，換了也寫回網址，連結傳給別人會開同一張。
// 沒有 JavaScript 的時候：照片照樣滑得動，六塊介紹全部排在下面，沒有東西會不見。
//
// 中英兩版各有一排照片（兩版的字都在 HTML 裡），同一時間只看得到一排。
// 換語言之後剛出現的那一排還停在第一張，所以每次換語言都要對一次位置（最下面那一段）。

// 第幾張：捲了多少除以一張的寬度，四捨五入，夾在 0 到 n-1。
export function indexAt(scrollLeft, width, n) {
  if (!(width > 0) || !(n > 0)) return 0;
  return Math.max(0, Math.min(n - 1, Math.round(scrollLeft / width)));
}
// 往前或往後一張，到頭就停，不繞回去（繞回去的話最後一張按「下一個」會倒著飛過五張）。
export function step(i, d, n) { return Math.max(0, Math.min(n - 1, i + d)); }

if (typeof document !== "undefined") (() => {
  const html = document.documentElement;
  if (html.hasAttribute("data-past")) return;   // 前幾屆那一頁（?term=）沒有這一排照片，見 past.js
  const stages = [...document.querySelectorAll(".stage")];
  if (!stages.length) return;
  const keys = [...stages[0].querySelectorAll(".slide")].map(s => s.dataset.team);
  const reels = stages.map(st => st.querySelector(".reel"));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasEnd = "onscrollend" in window;
  let cur = Math.max(0, keys.indexOf(html.dataset.tm || location.hash.slice(1)));

  function paint() {
    html.dataset.tm = keys[cur];
    for (const st of stages) {
      st.querySelectorAll(".slide").forEach((s, i) => s.classList.toggle("on", i === cur));
      st.querySelectorAll(".rail button").forEach((b, i) => { if (i === cur) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
      st.querySelector(".prev").disabled = cur === 0;
      st.querySelector(".next").disabled = cur === keys.length - 1;
    }
    try { history.replaceState(null, "", location.pathname + location.search + "#" + keys[cur]); } catch (e) { /* 改不了網址不影響畫面 */ }
  }
  // **照片停在哪一張，下面那一塊就是哪一個 team。** 位置是唯一的依據：
  // 不管是手指滑的、箭頭捲的、還是捲到一半被打斷，停下來之後照這一支對一次，照片跟下面那一塊不會對不上。
  // 看得到的那一排才有寬度（另一種語言那一排是 display:none）。
  function sync() {
    const reel = reels.find(r => r.clientWidth);
    if (!reel) return;
    const i = indexAt(reel.scrollLeft, reel.clientWidth, keys.length);
    if (i !== cur) { cur = i; paint(); }
  }
  // aim 是「箭頭正在把照片滑去哪一張」。滑到之前不理會捲動事件，
  // 不然按一下箭頭，下面那一塊會先閃回上一個 team 再換過去。
  // 滑完的訊號是瀏覽器的 scrollend；沒有這個事件的瀏覽器（舊的 Safari）改看「250 毫秒沒有再捲」。
  let aim = -1, aimTimer = 0;
  function arm(ms) { clearTimeout(aimTimer); aimTimer = setTimeout(settle, ms); }
  function settle() { clearTimeout(aimTimer); aim = -1; sync(); }

  // 隔壁那一張：滑過去。隔兩張以上（按下面那六格）：直接切過去，照片淡入一下。
  // ⚠ 不要讓它一路滑過中間那幾張：每一張都是「一定要停」（CSS 的 scroll-snap-stop:always，手指用力一滑不會一次飛過三個 team），
  // 而 Chrome 對程式叫的捲動也照這條擋，一次滑兩張以上會整個不動（2026-11-24 實測：下面那一塊換了、照片沒換）。
  function go(i, instant) {
    const next = step(i, 0, keys.length), far = Math.abs(next - cur) > 1;
    const slide = !(instant || reduce || far);
    const reel = reels.find(r => r.clientWidth);
    const moves = !!reel && Math.abs(reel.scrollLeft - next * reel.clientWidth) > 2;
    cur = next;
    if (slide && moves) { aim = cur; arm(hasEnd ? 1500 : 400); } else { clearTimeout(aimTimer); aim = -1; }
    for (const r of reels) {
      if (!r.clientWidth) continue;
      if (far && !instant && !reduce) { r.classList.remove("cut"); void r.offsetWidth; r.classList.add("cut"); }
      r.scrollTo({ left: cur * r.clientWidth, behavior: slide ? "smooth" : "auto" });
    }
    paint();
  }

  stages.forEach((st, n) => {
    const reel = reels[n];
    let tick = 0;
    reel.addEventListener("scroll", () => {
      if (tick) return;
      tick = requestAnimationFrame(() => {
        tick = 0;
        if (aim >= 0) { if (!hasEnd) arm(250); return; }
        sync();
      });
    }, { passive: true });
    reel.addEventListener("scrollend", () => { if (aim >= 0) settle(); });
    st.querySelector(".prev").addEventListener("click", () => go(cur - 1));
    st.querySelector(".next").addEventListener("click", () => go(cur + 1));
    st.querySelectorAll(".rail button").forEach((b, i) => b.addEventListener("click", () => go(i)));
    st.addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault(); go(cur + (e.key === "ArrowRight" ? 1 : -1));
    });
  });
  // 視窗寬度變了（手機轉向）或換了語言，一張的寬度就不一樣，照目前這一張重新對位置。
  addEventListener("resize", () => go(cur, true));
  document.getElementById("lang").addEventListener("click", () => requestAnimationFrame(() => go(cur, true)));
  addEventListener("hashchange", () => { const i = keys.indexOf(location.hash.slice(1)); if (i >= 0 && i !== cur) go(i); });
  go(cur, true);
})();
