# 視覺收尾清單（2026-11-05）

Paul 2026-11-05 說「我要讓這個網站變成最好看的」。這份是收尾前的研究清單與逐頁稽核表，
之後每一次視覺改動都可以回來對一次。研究來源在最下面。

## 一、2025 到 2026 年值得抄的做法，以及用在哪

| # | 做法 | 為什麼 | 這個站用在哪 |
|---|------|--------|--------------|
| 1 | 按鈕四種狀態都要有：滑過、按下、鍵盤聚焦、停用 | 手機沒有滑過，鍵盤沒有滑鼠。少一種狀態就有一種人感覺「沒反應」，而沒反應的時候人會再按一次 | 全站。按下那一段每頁已有（2026-09-08），這次補滑過的過渡與聚焦環的一致 |
| 2 | 過渡時間 100 到 300 毫秒，一套 easing | 太慢像卡住，太快像沒動。同一個站每顆按鈕速度不一樣，看起來就是拼湊的 | `shared/brand.css` 加 `--dur` 與 `--ease` 兩個 token，各頁只寫 var() |
| 3 | 按下去要立刻縮，不要過渡 | 按壓是回饋不是動畫，延遲回饋比沒有回饋更像當機 | 全站的「點下去要有回饋」那段維持原樣，刻意不加 transition |
| 4 | `:focus-visible` 一律 2px 實線加 3px 外距，對比 3:1 以上 | WCAG 2.2 的焦點外觀。深藍在米白上是 9.9:1，綠色或橘色當焦點環會過不了 | 全站焦點環改讀同一個 token，後台原本是 2px 外距，對外頁是 3px，統一成 3px |
| 5 | 滑過連結底線位移，不要整段字縮放 | 文字縮放會讓一段字跳動，位移底線只動那一條線 | 對外頁 `.body a`、頁尾連結、登入頁 `.link` |
| 6 | 卡片滑過浮起：陰影加深，不放大 | 放大會擠到旁邊的東西，陰影不會。而且不動 transform，按下去那一下的縮小就不會被過渡拖慢 | `/app/` 的選單卡、後台側欄項目、活動卡 |
| 7 | 捲到才出現（scroll reveal）用 CSS `animation-timeline: view()`，不用 JS | 零 build、零函式庫，不支援的瀏覽器直接看到內容。GSAP 只留給首頁的島 | 對外內容頁的每一段 `.sec-in`，包在 `@supports` 裡，沒有就是靜態 |
| 8 | 跨頁淡入淡出用 View Transitions API 的兩行 CSS | 換頁時不閃白。不支援的瀏覽器照舊換頁，沒有任何壞處 | `shared/brand.css` 加 `@view-transition{navigation:auto}`，全站一起拿到 |
| 9 | `prefers-reduced-motion` 一律關掉前庭刺激（位移、縮放、視差），顏色過渡可以留 | 無障礙需求不是視覺偏好（2026-08-25 裁定）。check-motion.mjs 守著 | 新加的 reveal、view transition 都要在 reduce 區塊裡關掉 |
| 10 | 載入中用骨架（skeleton），不要只有一行字；容器加 `aria-busy` | 一到三秒的等待，骨架讓人知道「畫面要來了、長這樣」 | 後台已有 `.skeleton`；護照、看板、設定、登入頁開頁那一行「載入中」改成有呼吸的骨架 |
| 11 | Toast 從下方 6px 滑入、淡出，180 毫秒，reduce 時只淡不滑 | 讓人看到「剛剛發生了什麼」，又不擋住內容 | 後台已有；護照與實習護照的 toast 對齊同一組數字 |
| 12 | 對比度 AA：內文 4.5:1、大字與圖形 3:1。用 rgba 調深淺，不用 opacity | opacity 會連對比一起打折，這個 repo 踩過四次 | 下表「對比」一欄。深藍 72% 以上在米白上才過 4.5 |
| 13 | 手機可點區域 44×44（AAA），最低 24×24（AA） | 高中生多用手機，手指比滑鼠粗 | 頂欄、藥丸鈕都用看不見的墊片撐到 44；下表逐頁看 |
| 14 | `::selection` 用品牌色 | 選取文字時的那一下顏色是最便宜的品牌觸點 | 全站：橘底深藍字 |
| 15 | 停用狀態要用真的 `disabled` 屬性，不只是變淡 | 變淡的假按鈕一樣能按，螢幕閱讀器也唸不出「停用」 | 全站 `.btn[disabled]` 已照做；這次補 `cursor` 與對比 |

## 二、品牌色對比速查（WCAG 公式算出來的實際值）

| 前景 | 底色 | 對比 | 可以怎麼用 |
|------|------|------|-----------|
| 深藍 #102A86 | 米白 #EDE5D8 | 9.90 | 內文、標題，隨便用 |
| 深藍 | 白 | 12.37 | 卡片上的字 |
| 深藍 | 主橘 #FFC46C | 7.87 | 橘底按鈕上的字 |
| 米白 | 深藍 | 9.90 | 深藍按鈕上的字 |
| 主橘 | 白 | 1.57 | **不能當文字色**，只能當底色、線條、光點 |
| 主橘 | 米白 | 1.26 | 同上 |
| 深藍 | 蒂芬妮綠 #6BC6BB | 6.14 | 綠底標籤上的字 |
| 深藍 72% | 米白 | 4.92 | 次要文字的**下限** |
| 深藍 62% | 米白 | 3.78 | 只能當大字（24px 以上）或圖形 |
| 深藍 55% | 米白 | 3.17 | 內文不行 |
| 中性灰 #C6C6C6 | 米白 | 1.37 | 只能當分隔線 |

結論：橘色永遠是底色不是字色，次要文字的 rgba 不低於 .72。

## 三、逐頁稽核（2026-11-05，桌機 1280 與手機 375，截圖在 `docs/ui-polish/before/`）

評分：**有** 已做好、**半** 有但不一致或沒過渡、**無** 沒有。

| 頁面 | 滑過 | 按下 | 聚焦環 | 停用 | 過渡時間 | 對比 | 空／載入／錯誤 | 44px | 跟別頁一致 | 這次要修什麼 |
|------|------|------|--------|------|----------|------|----------------|------|-----------|-------------|
| `/` 首頁 | 半 | 有 | 有 | 不適用 | 半（.15s 各寫各的） | 有 | 不適用 | 有 | 基準 | 連結與按鈕的過渡統一成 token；跨頁淡入 |
| `/about/` | 半 | 有 | 有 | 不適用 | 半 | 有 | 不適用 | 有 | 有 | 段落捲到才出現；連結底線位移；CTA 過渡 |
| `/programs/` | 半 | 有 | 有 | 不適用 | 半 | 有 | 不適用 | 有 | 有 | 同 about |
| `/team/` | 半 | 有 | 有 | 不適用 | 半 | 有 | 不適用 | 有 | 有 | 同 about |
| `/impact/` | 半 | 有 | 有 | 不適用 | 半 | 有 | 不適用 | 有 | 有 | 同 about |
| `/partner/` | 半 | 有 | 有 | 不適用 | 半 | 有 | 不適用 | 有 | 有 | 同 about |
| `/join/` | 半 | 有 | **無**（沒有 :focus-visible 規則） | 不適用 | 半 | 有 | 有（「現在沒有開放」） | 有 | 半 | 補聚焦環；頁尾連結過渡 |
| `/alumni/` | 有 | 有 | 有 | 不適用 | 半 | 有 | 有 | 有 | 有 | 頂欄過渡統一 |
| `/apply/` `/resources/` `/events/` | 半 | 有 | 有 | 有 | 半 | 有 | 半（載入中只有一行字） | 有 | 有 | 載入骨架；活動卡滑過已有 |
| `/privacy/` | 無 | 有 | 半 | 不適用 | 半 | 有 | 不適用 | 有 | 半 | 連結滑過 |
| `/app/` 登入 | 半 | 有 | 有 | 有（.4） | 半 | **`.empty-v` 55% 過不了 AA** | 半（載入一行字） | 有 | 有 | 對比、選單卡浮起、輸入框聚焦過渡、載入骨架 |
| `/passport/` | 半 | 有 | 有 | 有 | 半 | 有 | 半 | 有 | 有 | 載入骨架、按鈕過渡 |
| `/intern-passport/` | 半 | 有 | 有 | 有 | 半 | 有 | 半 | 有 | 有 | 同護照 |
| `/availability/` | 半 | 有 | 半（只有 #bt-root 那條） | 有 | 半 | 有 | 半 | 有 | 有 | 載入骨架、按鈕過渡 |
| `/settings/` | 半 | 有 | 有 | 有 | 半 | 有 | 半 | 有 | 有 | 同上 |
| `/admin/*` 四頁 | 有 | 有 | 半（外距 2px 跟對外頁的 3px 不同） | 有 | 有 | **`.rail-item.off` 45%**（停用可接受）、`.toast-x` 60% | 有（skeleton、toast） | 有 | 基準 | 聚焦環對齊；側欄項目浮起；聊勝於無的 `.toast-x` 對比 |
| 信件預覽 iframe | 不適用 | 不適用 | 不適用 | 不適用 | 不適用 | 有（按鈕深藍字橘底） | 不適用 | 有 | 有 | 不動（信件 HTML 不能有 CSS 動畫） |

## 四、這次刻意不做、或要 Paul 決定的

- **更大膽的動態**（例如首頁段落的視差、游標跟隨的光）。可以做，但會提高手機的 LCP，Paul 2026-09-07 已經為開場動畫接受過一次 79 分。要做再說。
- **按下去的過渡**。現在是立刻縮 3%，刻意沒有過渡（2026-09-08 的決定）。這次維持。
- **護照本身的 DOM 與翻面動畫**不動（批 6 的決定）。
- **信件版型**不動，email 客戶端不吃 CSS 動畫。

## 研究來源

- 微互動與按鈕狀態：[DEV Community 2025 guide](https://dev.to/frontendtoolstech/micro-interactions-in-ui-small-details-that-transform-ux-2025-guide-3nkk)、[Hoverify](https://tryhoverify.com/blog/state-management-in-tailwind-handling-hover-focus-and-active-states-like-a-pro/)
- View Transitions 兩行 CSS：[WebKit blog](https://webkit.org/blog/16967/two-lines-of-cross-document-view-transitions-code-you-can-use-on-every-website-today/)、[Matthias Ott](https://matthiasott.com/notes/view-transitions-the-smooth-parts)
- 捲動驅動動畫：[WebKit guide](https://webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/)、[MDN view()](https://developer.mozilla.org/docs/Web/CSS/animation-timeline/view)
- 骨架與卡片浮起：[Bulma skeleton](https://www.mintlify.com/jgthms/bulma/elements/skeleton)、[hover interactions principles](https://playbooks.com/skills/dylantarre/animation-principles/hover-interactions)
- WCAG 2.2 焦點外觀與可點大小：[Somerset playbook](https://playbook.somerset.gov.uk/digital-inclusion-and-accessibility/whats-new-in-wcag-2-2/)、[Paradigma target size](https://en.paradigmadigital.com/dev/target-size-overlooked-aspect-accesibility/)
