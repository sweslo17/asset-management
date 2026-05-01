# Baseline 初始持倉建立功能 — Design Spec

**Date**: 2026-05-02
**Status**: Draft, pending implementation

## 背景與動機

系統的「投入 (Batch)」資料模型要求使用者輸入每筆投資的 `price_per_unit`（每股買入價）與 `funding_source.amount_twd`（資金來源金額）。然而第一次啟用系統時，使用者通常已經持有一批資產，而**已經忘記當初的買入成本**。

目前的「新增投入」流程無法解決這個情況——它預設使用者知道真實的歷史成本資料。

## 目標

提供一個獨立的「建立初始持倉 (Baseline)」流程，讓使用者一次性把系統啟用前已持有的資產灌入系統，不需要回憶原始買入成本。改用 **init 日的市場收盤價**作為成本基準。

## 非目標

- **不**還原 init 日之前的歷史損益（既有資料已遺失，無法還原）
- **不**支援按持倉細分多個 funding source（per-investment attribution）
- **不**允許使用者建立多筆 baseline batch（baseline 概念上一輩子只做一次）；系統不主動阻擋，但 UX 上不引導重複使用

## 核心概念決策

### 1. 成本基準：以 init 日收盤價當作買入價

| 欄位 | 值 |
|------|----|
| `Investment.price_per_unit` | Init 日（或最近交易日）的市場收盤價 |
| `Investment.exchange_rate` | Init 日的 USD/TWD（美股）；台股固定為 1 |
| `Investment.fees` | 0 |
| `Investment.date` | Init 日 |
| `FundingSource.amount_twd` | = 全部 investment 成本總和（自動計算） |

**結果**：Init 日當天的損益 = 0，之後系統正常追蹤。

### 2. 不引入新 entity / schema 變更

Baseline batch 在資料模型上跟一般 batch 完全相同：
- 重用 `Batch` / `FundingSource` / `Investment` 三個 entity
- 重用 `POST /api/batches` 端點
- 重用 NAV 計算邏輯（baseline 等同於以 init 日市值「進場」的一筆 batch）
- 不需要 Google Sheets schema 變更

語意區分透過 `Batch.description` 預設值「初始持倉」自然表達。

### 3. UI：獨立流程，與「新增投入」並排

理由：
- baseline 在語意上跟「真的投入一筆錢去買」不同，獨立流程降低混淆
- 表單可大幅簡化（價格、匯率、手續費、funding 金額皆自動帶入）
- 使用頻率極低（一輩子 1 次或極少數新 source 加入），分開放不會干擾日常的「新增投入」

### 4. 單一 funding source

Baseline 對應的 funding source 數量為 1，使用者只需輸入名稱。金額由系統自動計算為所有 investment 成本總和。

## UX 流程

### 入口

`ManagePage.tsx` 在「新增投入」按鈕旁加入「建立初始持倉」按鈕。

### 對話框：3 步驟

**Step 1：基本資訊**

| 欄位 | 行為 |
|------|------|
| 日期 | 預設今天，可選任意日期 |
| 資金來源名稱 | 文字輸入，autocomplete 自既有 source 名稱（重用 `existingSourceNames` pattern） |
| 說明 | 預設值「初始持倉」，可改 |

**Step 2：持倉清單**

每筆持倉欄位：

| 欄位 | 來源 | 是否可改 |
|------|------|---------|
| Ticker | 使用者輸入（透過既有 `TickerSearch` component） | 是 |
| 單位數（張/股） | 使用者輸入 | 是 |
| 每股價格 | 自動帶入：呼叫 `GET /api/quote` 取 init 日收盤價 | 是（fallback / 手動覆寫） |
| 匯率 | 自動帶入：美股取當日 USD/TWD，台股鎖定 1 | 是（同上） |
| 手續費 | 預設 0 | 是 |
| 小計 | 即時計算顯示 | — |

可動態增減持倉。

**自動帶入觸發時機**：當「日期 + ticker + market」三者都有值時，立即呼叫 `/api/quote` 取得價格與匯率，填入欄位。若 API 失敗或無資料，欄位保持可手動輸入並顯示警告。

**Step 3：確認**

- 顯示基本資訊與所有持倉
- 顯示**自動計算的投入金額** = 全部小計總和
- 提示「資金來源金額將自動 = 投入成本」
- 送出按鈕

送出時組成 `CreateBatchRequest`，呼叫既有 `POST /api/batches`。

## API 變更

### 新增端點：`GET /api/quote`

**Request**:
```
GET /api/quote?ticker=2330.TW&date=2026-04-30
Header: X-API-Key: <key>
```

**Response (200)**:
```json
{
  "ticker": "2330.TW",
  "date": "2026-04-29",
  "close": 1015.0,
  "usd_twd": null
}
```

| 欄位 | 說明 |
|------|------|
| `ticker` | 同 request |
| `date` | 實際取到的交易日（若請求日為假日，回傳最近一個前序交易日） |
| `close` | 該日收盤價 |
| `usd_twd` | 美股回傳當日 USD/TWD，台股回 `null` |

**Response (404)**:
```json
{ "error": "No price data available for ticker on or before requested date" }
```

**實作要點**：
- 重用 `fetchYahooPrices(ticker, date - 7 days)`，取最後一筆 `record.date <= requestDate` 的記錄
- 美股額外呼叫 `fetchYahooRates(date - 7 days)`，同樣取最後一筆 `<= requestDate`
- 同樣需要 `X-API-Key` 驗證（沿用既有 middleware）
- 不寫入任何 Sheets（純讀取 Yahoo）

### 既有端點不變
- `POST /api/batches`：baseline 對它而言就是普通的 batch（單一 funding source、若干 investments）
- `POST /api/backfill`：建好 baseline 後跑一次自動補齊歷史價格資料

## 檔案變更

### Worker (`/worker/src/`)

| 檔案 | 動作 | 內容 |
|------|------|------|
| `index.ts` | 修改 | 新增 `handleQuote(env, ticker, date)` handler、`matchRoute()` 中加入 `quote` 分支、router 加入對應 dispatch |
| `types.ts` | 修改 | 新增 `QuoteResponse` interface |
| `yahoo.ts` | 不變 | 重用既有函式 |
| `auth.ts` / `sheets.ts` | 不變 | — |

### 前端 (`/frontend/src/`)

| 檔案 | 動作 | 內容 |
|------|------|------|
| `components/manage/AddBaselineDialog.tsx` | 新增 | 3 步驟對話框，邏輯參考 `AddBatchDialog` 但簡化；重用 `useCreateBatch` hook |
| `components/manage/ManagePage.tsx` | 修改 | 加入「建立初始持倉」按鈕，並排於「新增投入」 |
| `api/client.ts` | 修改 | 加入 `fetchQuote(ticker, date)` 函式 |
| `api/types.ts` | 修改 | 加入 `QuoteResponse` 型別 |

### 不變更
- `Batch` / `Investment` / `FundingSource` 資料結構（前後端）
- Google Sheets schema
- NAV 計算邏輯（`utils/calculations.ts` 等）
- 既有的「新增投入」流程
- `wrangler.toml`，無新增 secret 或環境變數

## 部署

- Worker 部署：手動執行 `cd worker && npx wrangler deploy`
- 前端部署：沿用既有 GitHub Pages 流程（push to main）

## 邊界情況與錯誤處理

| 情境 | 處理 |
|------|------|
| Init 日為假日／週末 | API 自動回最近前序交易日的收盤價 |
| Yahoo Finance API 失敗 | 前端顯示警告，欄位仍可手動輸入 |
| Ticker 在 Yahoo 找不到 | 透過既有 `TickerSearch` 防呆，避免使用者輸入無效 ticker |
| 該 ticker 在請求日期前 7 天內無交易資料 | 回傳 404；前端顯示警告，使用者手動輸入 |
| 使用者建立第二筆 baseline batch | 系統不阻擋（資料模型允許），但 UX 不主動引導 |

## 不變的部分（重要 invariants）

- NAV 計算公式不變
- 既有 batch 不受影響
- 「投入紀錄」「資金來源」「分類分析」等頁面不需改動，會自然顯示 baseline batch
- 系統的核心邏輯（NAV 單位制、損益計算、報酬率）對 baseline 與一般 batch 一視同仁
