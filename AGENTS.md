# bt-site（Beyond Taiwan 官網與 BT Passport）

程式細節、慣例、部署見 README.md 與 docs/。

## 這個 repo 要往哪走
@GOALS.md
GOALS.md 是方向盤：北極星、這一季的目標、明確不做的事、優先序規則、什麼情況要停下來問 Paul。
開場先讀它再看 README.md 與 BT-Site-交接規格.md。
北極星是「明年一位沒寫過程式的新任幹部能自己接手，Paul 不用碰」。
任何讓「開一個資料夾、放一個 HTML、讀那三個共用檔案」不再成立的改動，先問 Paul。

# 來自 Anson（second brain，~/Anson）的 context，開場自動載入
@~/Anson/projects/bt-website/README.md
@~/Anson/.Codex/rules/brand-voice.md
@~/Anson/.Codex/rules/communication-style.md
Anson 的 README 有進度、Paul 丟過的想法、給程式端的待辦。做完功能改 docs 或 README，Anson 那邊說「同步程式碼文件」就會收到。

## 做完功能的收尾
每次功能做完或行為改變，更新 README.md 或 docs/ 對應段落再 commit。post-commit hook 只抄文件不抄程式碼，README 沒更新 Anson 就不知道你做了什麼。

## 跟 Paul 工作的方式
Paul 是 founder，不是這個 repo 的全職工程師。目標是讓他清楚知道現在在做什麼，並且能自己往下推。
- 收到指令先盤點再動手，格式照上面 import 的 communication-style「先盤點再動手」。
- 用白話講。技術名詞第一次出現就用一句話解釋（例如「migration，就是改資料庫欄位的腳本」）。不要用縮寫堆疊。
- 不要貼大段程式碼給他看，除非他要。講「改了哪個檔、行為變成怎樣」。
- 做完給三段：改了什麼、怎麼驗證（他可以自己點的步驟或指令）、下一步。
- 對外會影響使用者的改動（上線、寄信、改資料）先問。
- 繁體中文，專有名詞英文，不用 emoji，不用破折號。

## Anson（Paul 的 second brain，`~/Anson`）有什麼可以拿

Paul 看到的任何東西都會進 Anson。這個 repo 已經有讀取權限（`.Codex/settings.local.json`），
**需要什麼直接讀，不用問他，也不用等他貼過來**：

| 要找什麼 | 讀哪裡 |
|---|---|
| 他丟進來的任何資料（設計參考、研究、規範、文件） | 先讀 `~/Anson/wiki/index.md` 目錄，再讀個別頁 |
| 原始全文（網頁、PDF 轉的 markdown） | wiki 頁 frontmatter 的 `source:` 那一行指到哪就讀哪；設計與學習類在 `~/Anson/raw/learning/` |
| 他是誰、三個組織、事業線、收入結構 | `~/Anson/context/me.md`、`~/Anson/context/work.md` |
| 誰負責什麼、什麼時候該找誰 | `~/Anson/context/team.md` |
| 某件事為什麼這樣定、有沒有被推翻過 | `~/Anson/decisions/log.md`，append-only，新的在最下面 |
| SOP 與待建清單 | `~/Anson/references/` |

**開始做之前先查 `decisions/log.md`。** 那裡面是 Paul 已經拍板的事，
重提被否決過的方案會浪費他的時間，而且他不一定記得自己否決過。

反向的管道：Paul 在別的地方講的想法，Anson 會寫進 `~/Anson/projects/<專案>/README.md`
的「給程式端的待辦與想法」段。那一段已經被上面的 import 自動載入，開場就看得到。

**刻意沒開權限的**：`raw/private/`（協會法律文件正本）、`projects/`（之後會有學生資料）、
`personal/`（體重與健康紀錄）、`archives/`。需要那裡面的東西直接問 Paul。

## 這是 public repo，人名有紅線

`~/Anson/context/team.md` 的名單只用來判斷「該找誰」，**不得寫進任何對外頁面**。
要在網站上放真實姓名一律先問 Paul。**未成年一律不放**（team.md 明確標了誰是高中生）。
BT 的對外數字只能用 `~/Anson/wiki/entities/beyond-taiwan.md` 事實資料庫裡有的，不推估、不四捨五入成更好聽的數字。
