# bt-site（Beyond Taiwan 官網與 BT Passport）

程式細節、慣例、部署見 README.md 與 docs/。

# 來自 Anson（second brain，~/Anson）的 context，開場自動載入
@~/Anson/projects/bt-website/README.md
@~/Anson/.claude/rules/brand-voice.md
@~/Anson/.claude/rules/communication-style.md
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
