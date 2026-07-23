# 分潤工具 Dashboard 現況規格

文件更新日期：`2026-07-23`

事實基線：目前 repository 的 `app.js`、`index.html`、`styles.css`、`content-engine.js`、三組測試，以及 2026-07-23 生效的 Google Sheet 管理政策。

這份文件描述目前已實作行為與權限邊界，不把某一天的資料筆數、商品名、狀態數量或排程內容視為永久固定值。`index.html` 的資產 query version 只用於瀏覽器 cache busting，不代表完整產品版本。

## 目標與範圍

Dashboard 是純前端、唯讀的蝦皮分潤工作區，第一階段目標為追蹤每月 `NT$5,000` 實際分潤，並協助判讀商品、發文流程與下一步工作。

目前沒有登入、後端、資料庫、Google OAuth、Sheet write-back 或 Threads 發布 API。公開 CSV 的內容應視為公開資訊，不得放入 token、帳密、個資或其他秘密。

## 資料來源與載入行為

Spreadsheet ID：

```text
1KqTwe-hXAaQW4CHMepyje6iCyzmffppPXZ8-aGLd29U
```

Dashboard 平行讀取兩個公開 CSV：

| 來源 | 工作表用途 | gid | 程式契約 |
| --- | --- | --- | --- |
| 商品池 | 商品、選品與成效資料 | `0` | 依 header alias 取值，不固定欄數或位置 |
| 發文表 | 草稿、發文狀態與回填生命週期 | `807648560` | 驗證 25 欄 schema |

`loadAllData()` 使用 `Promise.allSettled()` 啟動兩個獨立讀取。每個請求都有 cache-busting 參數與 8 秒逾時：

- 商品池失敗時會顯示商品來源錯誤；發文表若成功，發文流程仍可顯示。
- 發文表失敗時會顯示 partial／錯誤提示；商品池 KPI、圖表與商品面板仍可使用。
- 發文表成功但存在未知狀態、重複 `post_id`、缺少商品 join、schema 或必填資料問題時，保留可用列並標示 partial，不整批中止。
- 商品池完成載入後會重新計算跨表 join 與發文表資料品質，避免平行載入順序留下過時的 partial 訊息。
- 左側「匯入 CSV」只替換瀏覽器記憶體中的商品池資料，不會寫入 Sheet，也不會持久保存。
- Parser 支援 quoted field、escaped quote、CRLF／LF、BOM header 與多行內容。

Google Sheet 管理政策要求 Sheet 操作驗證優先使用使用者已開啟的 Sheet 畫面；這是寫入與管理流程的限制，不會停用 Dashboard 既有的公開 CSV 唯讀載入。

## 商品池資料契約

營運端正式商品池目前可能有 30 欄；「30 欄」是外部資料契約，不是 `app.js` 的固定欄數檢查。程式：

- 依 header 名稱與 alias 取值，不依欄位位置。
- 比對 header 時忽略空白與英文字母大小寫。
- 目前有 35 組 canonical alias group，並非要求 CSV 必須剛好 35 欄。
- `normalizeRow()` 目前輸出 34 個內部屬性；`selectionDate` 會併入內部 `date`。

主要 alias group 如下：

| 內部欄位 | 可接受 header |
| --- | --- |
| `productId` | `product_id`、商品ID、商品 ID |
| `date` | 日期、紀錄日期、發文日期 |
| `selectionDate` | 選品日期、評估日期 |
| `month` | 月份、月分 |
| `postUrl` | 貼文URL、貼文 URL、Threads貼文、Threads URL |
| `productUrl` | 蝦皮商品連結、商品連結、商品URL、商品 URL |
| `affiliateUrl` | 分潤短連結、分潤連結、聯盟連結、短連結 |
| `product` | 商品名稱、品名 |
| `category` | 品類、分類 |
| `price` | 售價、價格 |
| `commissionRate` | 佣金率、分潤率 |
| `impressions` | 曝光數、曝光 |
| `interactions` | 互動數、互動 |
| `clicks` | 點擊數、點擊 |
| `orders` | 訂單數、訂單 |
| `sales` | 成交金額、銷售金額 |
| `revenue` | 實際分潤、分潤、收益 |
| `estimatedCommission` | 預估單筆分潤、預估分潤 |
| `status` | 狀態 |
| `priority` | 優先級、優先順序 |
| `selectionScore` | 選品總分、選品分數 |
| `weeklyRole` | 本週角色、主推角色 |
| `recommendedAngle` | 推薦發文角度、發文角度 |
| `audience` | 適合族群、目標族群、受眾 |
| `risk` | 可能風險、風險 |
| `hardGate` | 硬性門檻判定、硬性門檻 |
| `suitableForPush` | 適合主推、是否適合主推 |
| `whyNow` | 為什麼現在值得推、現在值得推 |
| `funnelResult` | 漏斗結果 |

完整且唯一的程式事實來源仍是 `app.js` 的 `fieldAliases`；這份表只列營運常用欄位。

### 商品狀態與優先級正規化

- `A`、`A級`、`高`、`高優先` → `高`
- `B`、`B級`、`中`、`中優先` → `中`
- `C`、`C級`、`低`、`低優先` → `低`
- `待發佈`、`待發布`、`待發文` → `待發文`
- `已發佈`、`已發布`、`已發文` → `已發文`

商品池中文狀態與發文表英文 publishing status 是兩套資料，不可用文字相似度自動互轉。

## 發文表 25 欄契約

正式發文表使用 `gid=807648560`。標準 25 欄順序為：

```text
日期
平台
貼文類型
商品名稱
貼文主題
貼文URL
分潤連結
是否發布
備註
post_id
product_id
status
main_text
reply_text
disclosure
time_slot
selection_tier
draft_source
asset_source
experiment_source
affiliate_url_ref
backup_product_id
backup_product_name
backup_reason
source_calendar
```

目前 adapter 也相容以 `實際分潤` 取代 `貼文主題` 的 25 欄變體；這是程式相容行為，不代表應任意改動正式 Sheet schema。

結構化列必須有 `post_id`；沒有 `post_id` 的舊範例列會視為 legacy 並排除於狀態計數與主推清單之外。`time_slot` 只在 `scheduled` 時必填；backup 三欄可空，不會因空白而使整列解析失敗。

### 發文狀態

Dashboard adapter 正規化以下 7 種 `status`：

| status | 中文顯示 | Dashboard 首屏計數 |
| --- | --- | --- |
| `draft` | 草稿 | 不另設計數卡 |
| `pending_review` | 待審核 | 有 |
| `approved` | 已核准 | 有 |
| `scheduled` | 已排程 | 有 |
| `published` | 已發布 | 有 |
| `needs_backfill` | 待回填 | 有 |
| `completed` | 已回填 | 有 |

因此程式接受 7 種狀態，但目前 UI 顯示 6 個營運計數。未知 status 會正規化為 `unknown` 並標示 partial。

`published`、`needs_backfill`、`completed` 應搭配已發布旗標與有效貼文 URL；`scheduled` 應有 `time_slot`。Dashboard 只呈現與檢查資料，不會在畫面中核准、排程、發布或寫回。

### `product_id` 與跨表 join

- 發文表以明確 `product_id` 關聯商品池。
- 商品池若沒有明確 ID，`deriveProductId()` 會從蝦皮分潤商品網址 `/product_offer/{數字}` 衍生 `shopee-{數字}`。
- join 使用標準化後的精確 `product_id`，不以商品名稱模糊比對。
- 找不到對應商品時保留發文列、標示 `missing:product-join` 與 partial。
- 重複 `post_id` 不會被靜默合併，會標示資料問題。

## KPI 與計算規則

- 月份優先讀 `月份`；否則從選品日期、評估日期或一般日期取 `YYYY-MM`；仍無法判斷時使用目前月份。
- 空白數值保留 `null`，字串 `0` 保留為有效 0。
- 實際分潤只讀 `revenue` alias。空白時維持 `null`，**不使用成交金額 × 佣金率或預估分潤代入**。
- 預估單筆分潤優先讀明確欄位；缺少時才使用 `價格 × 佣金率`。
- 月目標差額為 `max(5000 - 實際分潤, 0)`；沒有實際分潤時顯示尚無資料。
- CTR、CVR、EPC 缺少明確欄位時，分別依點擊／曝光、訂單／點擊、實際分潤／點擊推導。
- 分母為 0 或必要資料缺失時顯示 `-` 或空值，不製造假精度。

## 商品面板與清單規則

1. 核心推薦：候選需有商品，且至少有選品分數、待發文狀態、優先級、預估分潤或實際分潤之一；依選品分數、優先級、日期、預估分潤與商品名排序。
2. 低成效再測：符合 10 點擊 0 訂單、500 曝光 0 點擊，或至少 500 曝光且 CTR 低於 1%。
3. 高價值候選：有預估或實際分潤；優先依預估分潤排序，缺少預估值時才使用實際分潤。
4. 待處理清單：排除未更新、觀察、淘汰、已發文、已完成、完成、停止主推；其餘非空白狀態依待發文、優先級、預估分潤與日期排序。

三個商品面板各最多顯示 4 筆，待處理清單最多 12 筆。`weeklyRole` 會被讀取，但不直接控制三個商品面板；發文區則優先顯示 `selection_tier=主推` 的結構化貼文。

商品名稱連結優先順序為：貼文 URL、分潤連結、商品連結；三者皆無時顯示純文字。

## UI、響應式與可及性現況

目前畫面包含：

- 月份與重新整理工具列。
- 商品池來源狀態、手動 CSV 匯入與四階段商品工作流程。
- 6 個發文生命週期計數、主推貼文卡與待回填清單。
- 實際分潤目標、訂單、點擊、EPC、CTR、CVR 與未完成 KPI。
- 三個商品營運面板、Canvas 圖表與待處理表格。
- 發文區只有唯讀資訊與連結，沒有無程式支援的核准、排程或發布按鈕。

響應式現況：

- `1120px` 以下改為單欄主框架。
- `760px` 以下使用三欄導覽、單欄內容、卡片式表格與單欄發文卡。
- `420px` 以下再縮小間距，發文計數改為兩欄、生命週期軌道改為三欄換行。
- CSS 已針對 375px 寬度避免整頁橫向捲動；主要可見操作元素（導覽、月份選擇、重新整理、CSV 匯入標籤與內容連結）使用至少 44px 操作高度。

可及性現況：

- skip link 與可見鍵盤焦點。
- `aria-live`／`role=alert` 的載入、錯誤與 partial 狀態。
- 表格 caption 與語意化標題。
- Canvas accessible label 與 fallback。
- `prefers-reduced-motion`。

目前沒有 repo 內自動化的 375px visual regression、完整 DOM/browser 互動測試或螢幕閱讀器測試；因此「已實作響應式與基礎可及性」不等於已完成全面無障礙認證。

## `content-engine.js` 的實際整合狀態

`content-engine.js` 是獨立純函式，可產生 Threads 主文、自我回覆、固定分潤揭露、內容類型與初始 `draft` 狀態，並清理部分未經證實的使用經驗、價格、優惠、銷量、功效或數字效果宣稱。

目前：

- `index.html` 只載入 `app.js`。
- `app.js` 沒有呼叫 `ContentEngine`。
- Dashboard 只讀發文表內已存在的 `main_text`、`reply_text`、`disclosure` 與 status。
- content engine 的轉換表只實作 `draft -> pending_review -> approved -> scheduled`。
- 進入 `approved` 必須有有效 HTTP(S) 分潤連結。
- engine 尚未實作 `scheduled -> published -> needs_backfill -> completed` 的轉換，也沒有連接排程或發布 API。

因此不得宣稱文案引擎已直接接入 UI、排程自動化已完成，或 Dashboard 可以自動發布 Threads。

## 測試現況

目前共有 21 項 Node 核心測試：

| 測試檔 | 數量 | 覆蓋範圍 |
| --- | ---: | --- |
| `tests/app-data.test.mjs` | 7 | 優先級／商品狀態正規化、選品排序、null／0、實際分潤不以預估代入 |
| `tests/content-engine.test.mjs` | 8 | 主文格式、reply 揭露、有效連結 gate、風險清理、合法與非法 engine 狀態轉換 |
| `tests/posts-data.test.mjs` | 6 | 25 欄解析與 schema 變體、legacy 排除、`product_id` join、7 種 status、partial 與商品 ID 衍生 |

```text
node --check app.js
node --check content-engine.js
node --test tests/*.test.mjs
```

這 21 項是核心邏輯測試，不代表 fetch／timeout、DOM、browser、visual 或 screen-reader 已全面自動驗證。

## Sheet 與 Git 權限政策

依 2026-07-23 生效、並同步於 `README.md` 與 `publishing-workflow.md` 的政策：

- 只有助手3可以修改「分潤工具」Google Sheet；其他助手只能交接已核准資料。
- 不再建立任何名稱含「備份」的工作表分頁；既有同類分頁只有在使用者授權下才可清理，本文件不表示清理已完成。
- 寫入前必須核對正式商品池日期與發文表 `post_id`。
- 同一天已完成選取或已寫入發文表的資料不得再次覆寫；發現同日期或 `TH-YYYYMMDD` 同日 ID 必須停止並回報。
- 只有新日期、主代理明確核准、且上一輪資料仍未發布時，才可替換上一輪資料。
- 已發布、已完成、正式歷史資料及正式分頁不得任意刪除、重新命名、隱藏或覆寫。
- Sheet 操作驗證優先使用使用者目前開啟的 Sheet 畫面；只有登入、CAPTCHA、權限或目標不明時才停止並請使用者介入。
- Dashboard 的公開 CSV 唯讀讀取仍可繼續，不等於 Sheet 寫入權限。
- 只有助手4可以執行 `git add`、commit、push，且仍需主代理核准精確檔案範圍。

## 尚未實作

- 第三個獨立成效表資料來源，以及商品池／發文表／成效表三表合併。
- 私人 Sheet 安全讀取、Google OAuth、write-back 與持久化。
- Dashboard 中的人工文案產生／審核介面與 `content-engine.js` 直接整合。
- Threads 自動排程、發布、發布結果同步與錯誤補償。
- 24h／72h／7d 的自動到期判定、提醒與成效寫回；目前只依發文表 status 顯示待回填區。
- 商品或分潤連結的遠端有效性自動檢查。
- 可調整資料來源、月目標、門檻與狀態的設定 UI。
- CSV schema 預覽、錯誤列報告、匯入持久化與跨列自動去重。
- 日期區間、上週／上月比較、進階篩選與月報匯出。
- 完整 fetch／CSV edge cases、DOM、browser、375px visual regression 與 screen-reader 自動測試。
