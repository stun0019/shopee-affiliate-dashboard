# Threads 發文核心

`content-engine.js` 是獨立的純函式內容引擎，不讀取 Google Sheet，也不直接發布貼文。

`index.html` 只載入 `app.js`，`app.js` 沒有呼叫 `ContentEngine`。Dashboard 已讀取 Google Sheet 發文表中的既有草稿、揭露與 publishing status，並顯示流程和待回填清單；這不代表文案引擎已接入 UI，也不會直接發布 Threads。

## 輸入與輸出

`createThreadsDraft(product)` 接受商品名稱、賣點、推薦／發文角度、族群、風險、分潤連結與本週角色，輸出：

- `mainText`：2–4 行，單一鉤子，不含連結。
- `replyText`：單行自然承接、分潤連結與固定揭露。
- `disclosure`：固定揭露文字。
- `contentType`：依本週角色、角度和族群推導。
- `status`：固定從 `draft` 開始。

中文欄位和 camelCase 欄位都可使用。風險只作工程守門，不會被改寫成賣點。

目前固定揭露原文：

```text
（分潤連結，透過連結購買我可能獲得分潤）
```

## 文案原則

1. 首句像真人情緒，不使用制式商品介紹。
2. 第二句只講一個痛點、反差或具體用途，其餘交給圖片或影片證明。
3. 有明確族群與使用動作時，才採族群點名與拜託式鉤子；不讓每篇使用同一驚嘆句。
4. 家庭收納或重複拿取商品可採「誰設計的／終於有解」，但必須搭配原創整理前後或操作畫面。
5. 可愛與低價只能是輔助訊號，不能單獨當作高分享理由。
6. 夫妻或家人對話只能引用已確認的真實素材，系統不得捏造。
7. 角色、迷因或疑似仿品商品必須另做 IP、仿品與素材授權審核。
8. 不捏造親身使用、價格、優惠、銷量或效果；無可靠證據的數字效果會被移除。

`UNSAFE_PATTERNS` 與數字效果清理只是工程守門，不是完整法遵系統，也不取代平台政策、廣告法規、醫療／食品規範、商品頁核實、素材授權或人工審核。

## 兩套不同狀態

Dashboard 中文商品狀態用於營運清單，會把待發佈／待發布正規化為待發文，把已發佈／已發布正規化為已發文。

Threads publishing status 則只允許：

```text
draft -> pending_review -> approved -> scheduled
```

進入 `approved` 前必須有有效 HTTP(S) 分潤連結；跳級、倒退或未知狀態會被拒絕。

這兩套狀態用途不同，不可直接用文字相似度互相轉換，也不可把 Dashboard 的待發文自動升級為 publishing approved。

## 測試

目前共有 21 項 Node 核心測試：

- Dashboard 資料核心：`tests/app-data.test.mjs`，7 項。
- Threads 文案引擎：`tests/content-engine.test.mjs`，8 項。
- 發文表資料：`tests/posts-data.test.mjs`，6 項。

```text
node --check app.js
node --check content-engine.js
node --test tests/*.test.mjs
```

文案引擎 8 項測試涵蓋 2–4 行主文、主文無連結、reply 揭露、approved link gate、風險清理、高分享型無證據時間效果移除，以及合法／非法狀態轉換。發文表 6 項測試涵蓋 25 欄解析、schema 變體、舊列排除、商品關聯、七種狀態、partial 資料與商品 ID 衍生。

測試不等於人工內容審核，也不等於 UI／browser／visual／screen-reader 驗證。

## 資料與安全邊界

- 純前端不能安全保存 API token、Sheet credential 或 Threads 發布秘密。
- 公開 Google Sheet CSV 應視為公開資料。
- 若未來加入私人 Sheet、write-back 或自動發布，必須使用安全後端或受控代理。
- 正式可追蹤的 CSV／XLSX 模板應放 `docs/templates/`；本機交接與匯出不應混入正式 repo 文件。
- 草稿只有到 `approved` 才代表通過內容審核；`scheduled` 也不等於已發布。
