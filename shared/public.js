/* shared/public.js：每一個對外頁都載的一支小程式（2026-11-21，Paul 同意在 shared/ 加這一個檔）。
   它只做兩件事，而且兩件都是「加分」：這支沒載到，每一頁的字、按鈕、連結一個都不會少。

     一、嘖嘖募資期間，每一頁最上面多一條橘色的橫條。
     二、捲動效果：往下捲的時候，清單、卡片、照片一個一個浮上來；數字從 0 數到定位。

   ┌──────────────────────────────────────────────────────────────────────────┐
   │  要打開募資橫條，只改下面 CAMPAIGN 的 url：把嘖嘖的網址貼進引號裡。        │
   │  日期到了它自己出現，過了自己消失，不用回來關。引號裡是空的就永遠不出現。  │
   └──────────────────────────────────────────────────────────────────────────┘

   不准長大：這支不連資料庫、不讀也不寫使用者裝置上的任何東西、不載別的檔案。
   check.sh 守著行數與這幾條。要加第三件事，先問 Co-President。 */
(function () {
  "use strict";
  var doc = document;

  /* ── 一、募資橫條 ── */
  var CAMPAIGN = {
    url: "",
    from: "2027-01-26", to: "2027-04-21",          /* 含頭含尾，台灣時間 */
    zh: "Beyond Taiwan 的 2027 募資開跑了，來支持這個計畫",
    en: "Our 2027 campaign is live. Back this project"
  };
  (function () {
    if (!CAMPAIGN.url || !/^https:\/\//.test(CAMPAIGN.url)) return;
    var today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);   /* 台灣是 UTC+8，沒有日光節約 */
    if (today < CAMPAIGN.from || today > CAMPAIGN.to) return;
    var a = doc.createElement("a");
    a.className = "bt-campaign"; a.href = CAMPAIGN.url; a.rel = "noopener";
    var zh = doc.createElement("span"), en = doc.createElement("span");
    zh.className = "zh"; zh.textContent = CAMPAIGN.zh + " →";
    en.className = "en"; en.textContent = CAMPAIGN.en + " →";
    a.appendChild(zh); a.appendChild(en);
    doc.body.insertBefore(a, doc.body.firstChild);
  })();

  /* 樣式跟著這支一起來，頁面不用各自抄一份。顏色只用 brand.css 的變數。 */
  var css = doc.createElement("style");
  css.textContent =
    ".bt-campaign{display:block;position:relative;z-index:2;padding:10px 16px;text-align:center;text-decoration:none;" +
    "background:var(--bt-orange);color:var(--bt-navy);font:600 14.5px/1.3 var(--body)}" +
    ".bt-campaign:hover{background:var(--bt-navy);color:var(--bt-cream)}" +
    ".rise{opacity:0;transform:translateY(20px)}" +
    ".rise.rise-go{opacity:1;transform:none;transition:opacity 620ms var(--ease),transform 620ms var(--ease)}";
  doc.head.appendChild(css);

  /* ── 二、捲動效果 ──
     使用者開了「減少動態效果」就整段不做：東西本來就在畫面上，只是不動。
     只藏「還在畫面下面」的東西；一開頁就看得到的不碰，所以不會閃一下。 */
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return;

  var RISE = "[data-rise], .rows li, .tl li, .nums > div, .nums > li, .prog, .partners li, .body > .photo, .ev-card";
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      if (e.target.hasAttribute("data-count")) return count(e.target);
      e.target.classList.add("rise-go");
      /* 浮完就把兩個 class 拿掉，還它原本的樣子（有些東西自己有 hover 的過渡）。 */
      setTimeout(function () { e.target.classList.remove("rise", "rise-go"); e.target.style.transitionDelay = ""; }, 1400);
    });
  }, { rootMargin: "0px 0px -8% 0px" });

  function arm(root) {
    var els = root.querySelectorAll(RISE), vh = window.innerHeight;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.classList.contains("rise") || el.offsetParent === null) continue;      /* 另一種語言那一份是藏起來的，不用管 */
      if (el.getBoundingClientRect().top < vh * 0.92) continue;
      /* 同一排的兄弟一個接一個，每個晚 70 毫秒，最多晚到第六個。 */
      var n = 0, s = el;
      while ((s = s.previousElementSibling) && n < 5) n++;
      el.style.transitionDelay = (n * 70) + "ms";
      el.classList.add("rise");
      io.observe(el);
    }
    /* 數字：HTML 裡寫的就是最終值，這裡先歸零再數回去，數完把原字串原樣寫回去。
       沒有數字的（例如英文的 Free）不動。 */
    var figs = root.querySelectorAll(".fig");
    for (var j = 0; j < figs.length; j++) {
      var f = figs[j], m = f.textContent.match(/^(\d[\d,]*)(.*)$/);
      if (!m || f.hasAttribute("data-count") || f.offsetParent === null) continue;
      if (f.getBoundingClientRect().top < vh * 0.92) continue;
      f.setAttribute("data-count", f.textContent);
      f.textContent = "0" + m[2];
      io.observe(f);
    }
  }

  function count(el) {
    var final = el.getAttribute("data-count"), m = final.match(/^(\d[\d,]*)(.*)$/);
    var target = parseInt(m[1].replace(/,/g, ""), 10), t0 = null, DUR = 1400;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / DUR), eased = 1 - Math.pow(1 - p, 3);
      el.textContent = p < 1 ? Math.round(target * eased).toLocaleString("en-US") + m[2] : final;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* 頁面上有些東西是晚一點才畫出來的（活動卡、團隊名單）。那些頁面畫完會叫一次 btRise()。 */
  window.btRise = function (root) { try { arm(root || doc); } catch (e) { /* 浮不起來就算了，內容都在 */ } };
  window.btRise(doc);
})();
