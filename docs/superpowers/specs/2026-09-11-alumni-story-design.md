# 校友與「我的故事」設計　2026-09-11

Paul 2026-09-11：「幫我加 Alumni，所有人都要在設定可以輸入這些資訊，
我要 Alumni 也可以回來註冊帳號，並且自己寫故事。」

目標 9（官網對外功能化）底下的一塊，同時把目標 8 剩下的那一件
（`/alumni/` 名單仍是示範資料）從「等 Paul 給名單」改成「校友自己填」。

---

## 這份文件在解決什麼

`/alumni/` 航線圖現在讀 `alumni/community.json`，裡面六筆全是示範資料。
真名單一直沒有上去，因為那條路是「Paul 蒐集每個人的資料與同意，再手動改 JSON」。
換屆之後那條路等於沒有人走得動。

改成：**校友自己有帳號、自己填故事、自己勾同意，Co-President 核可之後才公開。**

---

## Paul 2026-09-11 拍板的六件事

1. **校友用專用邀請碼進來**，不是自己勾、也不是後台一個一個改。
   校友比較接近幹部那一塊，不走學員那條路。
2. **設定頁那一區叫「我的故事」**，不叫「我的校友故事」。幹部與校友都有。
3. **兩把鑰匙**：本人勾同意，Co-President 核可，兩個都成立才會公開。
4. **核可之後改了文字就自動下架**，等重新核可。
5. **還沒有真人被核可之前，`/alumni/` 繼續顯示示範資料**，標示照舊。
6. 幹部與校友填得了，**學員填不了**。高中生還沒出發，那一區對他沒有意義。

### 這份推翻了一條既有決定

2026-09-07 的決定是「`/alumni/` 不接 Supabase，資料走 `alumni/community.json`」。
這份把它推翻成「先讀資料庫，沒有真人才退回 JSON」。
理由：那條決定的前提是「名單由寫程式的人維護」，而現在名單由校友本人維護。
要記進 `~/Anson/decisions/log.md`。

---

## 一、身分：邀請碼多一欄

### 資料庫

`invite_codes` 加一欄：

```sql
alter table invite_codes add column if not exists grants text not null default 'cadre'
  check (grants in ('cadre', 'alumni'));
```

預設 `cadre`，所以**既有的碼行為完全不變**。

### `claim_invite()` 的改法

現在的流程只認一種結果（升成幹部）。改成碼自己說它給什麼身分：

- 扣碼那一句改成 `update ... returning grants into v_grants`，
  **身分來自那一列，不是來自參數**。前端沒有任何地方說得出「我要變成什麼」。
- `update profiles set role = v_grants`。
- **`passports` 那一列只有 `v_grants = 'cadre'` 才建。** 校友沒有護照。
- 回傳值多一個 `upgraded_alumni`。

邊界行為，寫成測試：

| 現在是 | 碼給 | 結果 |
|---|---|---|
| student | cadre | 升成幹部，建護照，扣碼 |
| student | alumni | 變成校友，不建護照，扣碼 |
| alumni | cadre | 升成幹部，建護照，扣碼（校友回來當幹部是正常的事） |
| cadre | alumni | **不動、不扣碼**，回 `already_cadre` |
| alumni | alumni | **不動、不扣碼**，回 `already_alumni` |

不扣碼那兩條跟現在「幹部手滑按兩下不該燒掉一組碼」是同一個理由。

那支函式裡防競態的兩件事（`for update` 鎖自己那列、
`update ... where uses_left > 0` 加 `if not found`）**原樣保留**，
連同 `p_code` 不可以改名那條註解。

### 前端

- `shared/auth.js`：`claimInvite()` 認得 `upgraded_alumni`，錯誤訊息不變。
- `app/src/ui.js`：那顆按鈕從「我是 BT 幹部，我有邀請碼」改成
  **「我是幹部或校友，我有邀請碼」**，輸入框的提示從「跟組長拿」改成
  「跟組長或 BT 拿」。
- **使用者不選身分，碼決定身分。** 讓人自己選的話一定有人選錯，而選錯是權限問題。
- `app/src/main.js` 的 `render()`：`S.role === "cadre"` 那條轉址改成
  `cadre` 或 `alumni` 都送進 `/settings/`。
  校友因此**不會看到**「就讀學校、年級」那一頁，那是給高中生的。
- `shared/nav.js`：`settings` 那一項的 `roles` 加 `"alumni"`。
  校友的頂欄只有「設定」一項，護照、時間看板、申請管理都沒有。

---

## 二、資料表 `alumni_stories`

一個人一列，**不塞進 `profiles`**。理由：`profiles` 的欄位授權與政策已經有四層
（本人、幹部、president、anon），再疊十二欄公開文字會很難看出誰讀得到什麼。

```sql
create table if not exists alumni_stories (
  id             uuid primary key references profiles(id) on delete cascade,
  display_name   text,              -- 公開顯示的名字，可以遮字。空的話退回 profiles.name_zh
  school         text,              -- 高中全名
  county         text,              -- 島上的起飛點，只能是那 16 個
  city           text,              -- 現在在哪個城市
  country        text,              -- 中文國名
  place          text,              -- 現在念哪間學校或在哪裡工作
  quote          text,              -- 他自己的一句話（Iansui 手寫體那一句）
  note           text,              -- 兩三句介紹
  school_en      text,
  country_en     text,
  quote_en       text,
  note_en        text,
  public_story   boolean not null default false,   -- 本人那一把
  story_approved boolean not null default false,   -- Co-President 那一把
  approved_at    timestamptz,
  updated_at     timestamptz not null default now()
);
```

`county` 用 check constraint 限定 16 個縣市，跟 `scripts/taiwan/cities.json` 同一份。
**填錯的後果是那個人安靜地不出現在圖上**，所以擋在資料庫。

### 誰讀得到、誰寫得到

| 身分 | 能做什麼 |
|---|---|
| 本人 | 讀自己那一列、寫自己那一列（除了 `story_approved` 與 `approved_at`） |
| Co-President | 讀全部（核可要看內容）、透過 `set_story_approved()` 改核可 |
| 其他幹部 | 什麼都看不到。核可是 P/VP 的鑰匙，不是全體幹部的 |
| 沒登入的人 | **對這張表零權限**，只能透過下面那支函式拿到已核可的幾列 |

欄位授權跟 `profiles` 同一個做法：
`grant update (display_name, school, county, city, country, place, quote, note,
school_en, country_en, quote_en, note_en, public_story) to authenticated;`
**`story_approved` 不在裡面**，本人改不動自己的核可狀態。

### 改了文字就下架

```sql
create trigger alumni_story_recheck before update on alumni_stories ...
```

`quote`、`note`、`quote_en`、`note_en` 任何一欄變了，
就把 `story_approved` 設回 false、`approved_at` 設回 null。

- **寫在資料庫不是前端**，前端繞得過去的東西不算守門。
- 改名字、城市、學校不觸發（Paul 2026-09-11 的決定）。
- `updated_at` 每次寫入都更新，後台用它顯示「內容什麼時候改過」。

### 對外怎麼讀：兩支函式，不開放整張表

```sql
public_alumni()              -- 回已核可的每一位，不含大頭照
public_alumni_avatar(p_key)  -- 回一個人的大頭照
```

兩支都是 security definer，`grant execute to anon, authenticated`。

- `public_alumni()` 回的是畫面上要用的欄位加 `md5(id::text)` 當 key，
  **不回 uuid**。那是帳號 id，沒有理由出現在公開頁面的 HTML 裡。
- 條件：`public_story and story_approved and role in ('cadre','alumni')`。
  順序照 `approved_at`。
- **大頭照分開一支是刻意的。** 照片存成 data URL 在 `profiles.avatar`，
  一張二十到六十 KB。二十個人一起載就是一 MB 壓在一個對外頁面上，
  而那一頁的手機分數本來就只有 79。
  航線圖的互動是「點了才飛、飛到才出卡片」，**照片本來就不必一開始就載**。

---

## 三、設定頁：「我的故事」

`/settings/` 加一區，`role` 是 `cadre` 或 `alumni` 才出現。學員看不到。

欄位順序照 `/alumni/` 卡片上的順序，讓人填的時候就看得出成品長什麼樣：

1. 公開顯示的名字（預設帶中文姓名，旁邊一句「要遮字就寫成 張 O 睿」）
2. 高中（用 `app/schools.json` 自動完成，**選到的時候自動帶出縣市**）
3. 縣市（下拉 16 個。新北那一項寫成「新北（起飛點畫在台北）」）
4. 現在的城市、國家、學校或公司
5. 一句話
6. 介紹
7. 英文版四欄，收在「英文版（選填）」裡面，不填就顯示中文那一份

同意勾選的文字要把公開的東西逐項列出來：
名字、大頭照、高中、現在的城市與學校、那一句話與介紹。
旁邊一句狀態：沒勾／等核可／已經在公開頁上／改了文字所以重新等核可。

- 存檔併進現有那顆「存起來」，但**故事是另一張表，所以會有第二句 `update`**。
  跟 `profiles` 那兩句一樣寫成字面物件，`check.sh` 才看得懂（見第七節）。
- 幹部原本 `/team/` 的公開勾選**是另一件事**，兩邊分開。勾一個不等於勾另一個。
- 離島（澎湖、金門、馬祖）現在不在島的資料裡，所以縣市選不到。
  那一區寫一句「你的高中在離島的話先寫信給我們」。這是第一版的已知缺口。

---

## 四、`/alumni/` 換資料來源

- 先打 `public_alumni()`，拿到一筆以上就**只顯示真人**，示範標示消失。
- 零筆、或連不上資料庫 → 退回 `alumni/community.json`，畫面跟現在一模一樣。
  **退路要安靜**，對外頁面不講內部狀態。
- 資料轉成現有的 `people` 陣列形狀，`draw()` 一行都不用動。
- 點到某個人才去拿他的大頭照（`public_alumni_avatar`），拿不到就顯示姓氏圖示。
- 這一頁**仍然不載 supabase 套件**，用瀏覽器內建的 fetch 打 REST 端點。
- `alumni/community.json` 留著，`_readme` 改寫成「這是示範資料，真名單在資料庫」。

⚠ **待 Paul 決定**：那支 fetch 需要專案網址與公開金鑰，而它們現在在
`shared/supabase.js`，那個檔案一被 import 就會把整包 supabase 套件拉進來。
兩條路：

- 甲：新增 `shared/supabase-config.js` 只放兩個常數，`shared/supabase.js` 改成讀它。
  單一真相，但**動到 `shared/`，GOALS 說要先問**。
- 乙：`alumni/index.html` 自己寫一份常數，`check.sh` 加一條守門比對兩份一致。
  不動 `shared/`，代價是同一個值有兩份。

---

## 五、`/admin/` 的核可

「團隊頁」旁邊加一個「校友頁」分頁，**只有 Co-President 看得到**，跟團隊頁同一個形狀。

- 列出所有 `public_story = true` 的人，**等核可的排最上面**。
- 每一列顯示完整內容（名字、高中到城市、一句話、介紹），因為核可的是內容不是名字。
- 顯示 `updated_at`，讓人看得出「這是改過之後重新等核可的」。
- 核可走 `set_story_approved(p_target uuid, p_ok boolean)`，只有 president 叫得動，
  對象限 `role in ('cadre','alumni')`，跟 `set_public_approved()` 同一個寫法。
- 頁面最上面列核可前要確認的三件事：
  1. **滿 18 歲了嗎**（系統沒有生日欄位，這一條靠人）
  2. 真的是 BT 校友嗎
  3. 這段文字可以用 BT 的名義公開嗎

---

## 六、隱私政策

故事公開到網路上是**新用途**，`/privacy/` 現在沒有涵蓋。要加一段，內容包含：

- 公開的欄位逐項列出來
- 誰看得到（任何人，會被搜尋引擎收錄）
- 怎麼撤下來（設定頁取消勾選，立刻從公開頁消失）
- 撤下來之後搜尋引擎的快取不會立刻消失

`/privacy/` 是對外文案，**草稿要 Paul 過目才上**。

---

## 七、測試與守門

| 在哪 | 守什麼 |
|---|---|
| `test/alumni-story.test.mjs` | 必填檢查、縣市對照、狀態句、資料庫回來的形狀轉成 `people` |
| `test/nav.test.mjs` | 校友的頂欄只有「設定」，一項都不能多 |
| `supabase/rls-test.sql` | 四種身分對 `alumni_stories` 的讀寫矩陣、改文字會下架 |
| 遷移檔最後的驗收表 | `story_approved` 沒有發給 `authenticated`、兩支對外函式只回已核可的列 |
| `check.sh` | 前端寫進 `alumni_stories` 的欄位 vs 資料庫發出去的權限對帳（現有那條只掃 `profiles`）。走乙案的話再加一條比對兩份金鑰 |

---

## 八、明確不做（第一版）

- 設定頁的即時預覽。Iansui 只給首頁與 `/alumni/` 載，為了預覽多載一頁中文字體不值得。
- 離島的起飛點。島的資料裡沒有，要另外處理座標。
- 校友互相看得到彼此的資料。
- 核可通知信、站內通知。
- 校友名單匯出。
- 校友的護照或其他功能。校友身分現在只解鎖「設定」與「我的故事」。

---

## 九、上線步驟

1. 跑遷移檔（排在既有五支還沒跑過的後面）
2. 建一組 `grants = 'alumni'` 的測試碼
3. 自己走完一次：註冊 → 輸碼 → 填故事 → 勾同意 → 後台核可 → 看 `/alumni/`
4. 改 `/privacy/`（Paul 過稿）
5. 再開始邀請真的校友

⚠ 第 3 步不能跳。這個 repo 的五支遷移檔到現在**沒有一行在真的 Supabase 上跑過**。

---

## 十、會碰到的檔案

- 新增：`supabase/migrations/2026-09-17-alumni-stories.sql`、`test/alumni-story.test.mjs`
- 改：`supabase/schema.sql`、`supabase/rls-test.sql`、`shared/auth.js`、`shared/nav.js`、
  `app/src/main.js`、`app/src/ui.js`、`settings/src/main.js`、`settings/src/ui.js`、
  `settings/index.html`、`admin/src/data.js`、`admin/src/main.js`、`admin/src/ui.js`、
  `alumni/index.html`、`alumni/community.json`、`privacy/index.html`、
  `check.sh`、`README.md`、`GOALS.md`
