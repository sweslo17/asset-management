# 技術規格

## 架構

```
GitHub Pages (前端) → Cloudflare Worker (API) → Google Sheets (資料庫)
                      GitHub Actions (排程) → yfinance → Google Sheets
```

## 前端

- Vite + React + TypeScript
- TanStack Query（資料快取）、React Router（路由）
- Tailwind CSS v4 + shadcn/ui
- vite-plugin-pwa（NetworkFirst 快取策略）
- 部署：GitHub Pages，base path `/asset-management/`
- SPA 路由：404.html = index.html 副本

## API 層

- Cloudflare Worker（TypeScript）
- Google Sheets REST API v4，透過 Service Account JWT 認證（Web Crypto API）
- Secrets：`GOOGLE_SERVICE_ACCOUNT_JSON`、`GOOGLE_SHEETS_ID`、`API_KEY`

### 端點

| Method | Path | 說明 |
|--------|------|------|
| GET | /api/portfolio | 讀取全部 6 個 sheet |
| POST | /api/batches | 新增 batch + funding_sources + investments |
| PUT | /api/investments/:id | 更新投資記錄 |
| DELETE | /api/investments/:id | 刪除投資記錄 |
| PUT | /api/batches/:id | 更新 batch |
| DELETE | /api/batches/:id | 刪除 batch（cascade） |

## 排程任務

- Python 3.12 + Poetry
- gspread + yfinance + pydantic v2 + loguru
- GitHub Actions：週一至五各兩次（台股收盤後 14:00、美股收盤後 06:00 台灣時間）
- 首次執行自動回填歷史價格

## Google Sheets 結構

6 個分頁：`batches`、`funding_sources`、`investments`、`prices`、`exchange_rates`、`metadata`
