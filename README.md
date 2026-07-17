# 蝦皮分潤後台 Dashboard

文件更新日期：`2026-07-18`

文件事實基線：本次 Dashboard 發文表整合後的程式與測試。

目前沒有用單一正式 tag 表示整套功能版本；`index.html` 載入 `styles.css?v=0.7` 與 `app.js?v=0.6`。這些 cache query 不代表完整產品版本。

Dashboard 會平行讀取公開 Google Sheet 的商品池與 25 欄發文表，以 `product_id` 關聯商品，顯示各 publishing status 數量、主推貼文流程與待回填清單；任一來源失敗時，另一來源仍可繼續使用。`content-engine.js` 仍是獨立純函式，尚未由 Dashboard UI 直接呼叫，也不會自動發布 Threads。

第一階段目標仍是追蹤每月 `NT$5,000` 蝦皮分潤，讓選品、內容與成效可以用一致資料口徑判讀。

## 專案檔案

- `index.html`：Dashboard 畫面、可及性標記與區塊結構。
- `styles.css`：桌面、平板、手機、鍵盤焦點與 reduced-motion 樣式。
- `app.js`：CSV 讀取、資料正規化、欄位別名、KPI、營運規則與 Canvas 圖表。
- `content-engine.js`：Threads 草稿、揭露、風險清理與 publishing status 純函式。
- `dashboard_spec_for_da-bing-nai.md`：Dashboard 現況與資料規格。
- `publishing-workflow.md`：Threads 文案引擎、審核狀態與安全邊界。
- `tests/app-data.test.mjs`：Dashboard 資料核心測試。
- `tests/content-engine.test.mjs`：文案引擎測試。
- `tests/posts-data.test.mjs`：25 欄發文表、狀態、關聯與部分資料測試。
- `.gitignore`：本機環境、秘密、匯出、work 與暫存檔防護規則。

## 快速使用

直接開啟 `index.html` 即可使用 Dashboard，不需要安裝套件、登入或啟動後端。

啟動後會讀取 `app.js` 內固定設定的兩個 Google Sheet 公開 CSV：

- 商品池：`gid=0`
- 發文表：`gid=807648560`，驗證 25 欄結構。
- 請求：每次加入 cache-busting 參數。
- 逾時：8 秒後中止並顯示錯誤。

讀取失敗時，可用左側「匯入 CSV」載入本機 UTF-8 CSV。Parser 支援 quoted field、escaped quote、CRLF／LF 與 BOM header；匯入資料只存在瀏覽器記憶體，重新整理後不會保存。

Google Sheet 必須能公開輸出 CSV。公開 CSV 中的內容應視為公開資訊，不要放 API token、帳密、個資或其他秘密。

## Dashboard 已完成能力

- 月份切換：預設目前月份；沒有目前月份資料時改選資料中的最新月份。
- KPI：實際分潤、NT$5,000 目標、訂單、點擊、EPC、CTR、CVR 與未完成數。
- Canvas 圖表：每日實際分潤、品類實際分潤、內容類型的分潤／CTR／CVR。
- 營運面板：核心推薦、低成效換角度再測、高價值加碼候選，各最多 4 筆。
- 未完成清單：最多 12 筆，排除未更新、觀察、淘汰、已發文、完成與停止主推等狀態。
- 商品跳轉：貼文 URL 優先，其次分潤連結，再其次商品連結。
- 手機版：760px 以下改為三欄導覽與卡片式表格，420px 以下再縮排。
- 可及性：skip link、visible focus、live alert/status、表格 caption、Canvas label/fallback 與 reduced motion。
- 發文流程：讀取 25 欄發文表，以 `product_id` 關聯商品池，顯示待審核、已核准、已排程、已發布、待回填與已回填數量。
- 部分資料容錯：未知狀態、重複 `post_id`、缺少商品關聯或單一來源失敗時標示待確認，不中斷其他可用資料。

## Google Sheet／CSV 資料契約

### 欄數不是固定 schema

營運端外部 Sheet 可能使用 30 欄，但目前程式沒有驗證「必須剛好 30 欄」。Dashboard 依 header 名稱取值，不依欄位位置，也會忽略 header 空白與英文字母大小寫。

`app.js` 目前宣告 35 組商品池 canonical alias group；除下列 34 組外，另有 `productId`（`product_id`、商品ID、商品 ID）：

1. `date`：日期、紀錄日期、發文日期
2. `selectionDate`：選品日期、評估日期
3. `month`：月份、月分
4. `postUrl`：貼文URL、貼文 URL、Threads貼文、Threads URL
5. `productUrl`：蝦皮商品連結、商品連結、商品URL、商品 URL
6. `affiliateUrl`：分潤短連結、分潤連結、聯盟連結、短連結
7. `contentType`：內容類型、文案類型
8. `product`：商品名稱、品名
9. `category`：品類、分類
10. `price`：售價、價格
11. `commissionRate`：佣金率、分潤率
12. `impressions`：曝光數、曝光
13. `interactions`：互動數、互動
14. `clicks`：點擊數、點擊
15. `orders`：訂單數、訂單
16. `sales`：成交金額、銷售金額
17. `revenue`：實際分潤、分潤、收益
18. `estimatedCommission`：預估單筆分潤、預估分潤
19. `ctr`：CTR
20. `cvr`：CVR
21. `epc`：EPC
22. `status`：狀態
23. `nextAction`：下次行動、建議行動
24. `priority`：優先級、優先順序
25. `pitch`：一句賣點、賣點
26. `selectionScore`：選品總分、選品分數
27. `weeklyRole`：本週角色、主推角色
28. `recommendedAngle`：推薦發文角度、發文角度
29. `audience`：適合族群、目標族群、受眾
30. `risk`：可能風險、風險
31. `hardGate`：硬性門檻判定、硬性門檻
32. `suitableForPush`：適合主推、是否適合主推
33. `whyNow`：為什麼現在值得推、現在值得推
34. `funnelResult`：漏斗結果

`normalizeRow` 目前輸出 34 個內部屬性。`selectionDate` 會併入內部 `date`；`sales` 雖可讀取，但不會拿來代替 `revenue`。

如果營運端要把固定 30 欄當正式契約，應另在 `docs/templates/` 建立權威模板與 required／optional 說明，不應從目前程式反推「固定 30 欄」。

### 值與計算語意

- 空白成效值保留 `null`；字串 `0` 保留為真實 0。
- 實際分潤只讀 `revenue` alias group。實際分潤空白時維持 `null`，**不使用成交金額 × 佣金率代入**。
- 預估單筆分潤優先讀明確欄位；沒有明確值時，才可由 `價格 × 佣金率` 計算。
- CTR、CVR、EPC 可使用明確欄位；未提供時，分別依可用的點擊／曝光、訂單／點擊、實際分潤／點擊推導。

### 優先級與商品狀態正規化

- `A`、`A級`、`高`、`高優先` → `高`
- `B`、`B級`、`中`、`中優先` → `中`
- `C`、`C級`、`低`、`低優先` → `低`
- `待發佈`、`待發布`、`待發文` → `待發文`
- `已發佈`、`已發布`、`已發文` → `已發文`

## 三個營運面板與本週角色

目前三個 Dashboard 商品面板使用三套不同規則，不是直接依 `本週角色` 分流：

1. 核心推薦：候選需有商品，且至少有選品分數、待發文狀態、優先級、預估分潤或實際分潤之一。排序為 `選品總分 → 優先級 → 日期新鮮度 → 預估單筆分潤 → 商品名`。
2. 低成效換角度再測：10 點擊 0 訂單、500 曝光 0 點擊，或曝光至少 500 且 CTR 低於 1%。
3. 高價值加碼候選：有預估單筆分潤或實際分潤，優先依預估單筆分潤排序，沒有預估值才使用實際分潤。

`本週角色` 會被商品池正規化資料讀入，也會被文案引擎用來推導內容類型；Dashboard 三個商品面板函式不使用它。發文流程則依發文表的 `selection_tier` 優先顯示「主推」，兩者不可混為同一欄位。

未完成清單另有自己的排序：待發文優先，再依優先級、預估單筆分潤與日期排列。不要把這套排序和核心推薦排序混為一談。

## Threads 文案引擎

`content-engine.js` 是獨立純函式，可在 Node/CommonJS 或全域環境使用。

`index.html` 只載入 `app.js`，Dashboard UI 沒有載入或呼叫 `ContentEngine`。目前整合的是已存在於發文表的結構化文案與 publishing status，不是由 UI 即時產生文案。

`createThreadsDraft(product)` 會產生：

- 2–4 行、沒有網址的 `mainText`
- 含分潤連結與揭露的單行 `replyText`
- 固定 `disclosure`
- `contentType`
- 初始 `status: draft`

目前固定揭露原文為：

```text
（分潤連結，透過連結購買我可能獲得分潤）
```

Publishing status 只能依序前進：

```text
draft -> pending_review -> approved -> scheduled
```

進入 `approved` 必須有有效 HTTP(S) 分潤連結。這套英文 publishing status 和 Dashboard 中文商品狀態是兩套不同狀態系統。

工程上的風險清理會阻擋或移除捏造使用經驗、價格、優惠、銷量、功效與無證據數字效果；它不取代平台政策、廣告法規、商品事實核對、素材授權或人工審核。詳細規則見 `publishing-workflow.md`。

## 測試

目前共有 21 項 Node 測試：

- `tests/app-data.test.mjs`：7 項，涵蓋優先級／狀態正規化、選品排序、null／0 與實際分潤語意。
- `tests/content-engine.test.mjs`：8 項，涵蓋主文格式、揭露、有效連結、風險清理與 publishing status。
- `tests/posts-data.test.mjs`：6 項，涵蓋 25 欄 RFC 4180 解析、schema 變體、舊列排除、`product_id` 關聯、七種狀態、partial 資料與商品 ID 衍生。

執行方式：

```text
node --check app.js
node --check content-engine.js
node --test tests/*.test.mjs
```

核心測試不等於完整 browser／UI／visual／accessibility automation。

## 安全、權限與本機檔案

- 專案是純前端，沒有 Google OAuth、登入、角色權限、後端代理或 Sheet write-back。
- 不可把 API token、Sheet credential、private key 或個資放進 `app.js`、HTML、公開 CSV 或其他前端資產。
- `.gitignore` 已忽略本機 env、key／PEM／P12／PFX／JKS、`secrets/`、`credentials/`、`local-exports/`、`work/`、`handoff/`、`temp/`、`tmp/` 與 Codex worktree；經審核的 env example／sample／template 命名可被追蹤。
- 正式可追蹤的 CSV／XLSX 範本應放 `docs/templates/`；本機實際匯出放 `local-exports/`。
- `.gitignore` 不是 secrets scanner，也不會保護已經被 Git 追蹤或提交的秘密。若秘密曾進入版本歷史，必須輪替並另行清理。

## 已知限制

- 目前只讀固定的商品池與發文表公開 CSV；尚未讀取獨立成效表，也沒有可調整來源的 UI。
- 私人 Sheet 無法由目前純前端安全讀取，也不能回寫或保存狀態。
- 手動匯入只存在瀏覽器記憶體，沒有 schema preview、錯誤列報告或跨列自動去重。
- 月目標、資料網址與低成效門檻寫在程式中，沒有 UI 設定。
- 外部 30 欄 Sheet 不是程式硬性 schema。
- `content-engine.js` 尚未由 Dashboard UI 直接呼叫，也未連接 Threads 發布 API；Dashboard 只讀取發文表既有草稿與狀態。
- 沒有多使用者、登入、資料庫與安全後端。
- 已有 21 項核心測試與基礎可及性實作，仍缺 browser／visual／screen-reader 自動驗證。

## 建議下一步

1. 新增獨立成效表來源，並以穩定 `product_id`／`post_id` 和現有商品池、發文表合併。
2. 建立 `docs/templates/` 的正式資料模板，明確標示 required、optional、aliases 與 consumer。
3. 增加 CSV 匯入預覽、必填欄位檢查、錯誤列提示與重複偵測。
4. 規劃安全後端或 Google Sheets API 代理，支援私人資料、write-back 與持久化。
5. 將文案引擎接入人工審核 UI；在完成權限與錯誤補償前，不直接自動發布。
6. 增加 fetch／CSV edge case、DOM、browser、375px visual 與 screen-reader 測試。
7. 加入日期區間、上週／上月比較、進階篩選與月報匯出。
