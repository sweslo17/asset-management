# 部署執行手冊 — asset-management 重構 + investment-judgement 整合

> 程式已全部改好（見下方「已完成的程式變更」）。本手冊是你要執行的部署動作，照順序做。
> 目標：①網路隨時可查 ②只有特定的人可查 ③investment-judgement 排程能每日讀取
> 舊資料：全部清除，D1 從空白起算。

## 最終架構

| 層 | 新 |
|---|---|
| 前端 | **Cloudflare Pages**（Git 整合自動建置，base `/`）|
| API | Cloudflare Worker（資料層 D1） |
| DB | **Cloudflare D1**（SQLite） |
| 價格更新 | **Worker Cron Trigger**（每日，取代 Python＋GitHub Actions）|
| 人的認證 | **Cloudflare Access**（email 白名單，保護 Pages）|
| 機器讀取 | `GET /api/sleeve-summary?token=`（唯讀，judgement 用）|

---

## 已完成的程式變更（不用你動，僅供對照）

- `worker/schema.sql`（新）：D1 schema，含 strategy=leverage-sleeve 種子標籤
- `worker/src/d1.ts`（新）：D1 資料層，含 `getSleeveSummary`
- `worker/src/index.ts`：handlers 全改 D1；新增 `/api/sleeve-summary` 唯讀 token 端點；新增 `scheduled()` cron（每日增量更新價格）
- `worker/src/types.ts`：Env 改 DB＋READ_TOKEN；Investment 加 txn_type
- `worker/wrangler.toml`：加 D1 binding 區塊（待貼 id）、cron triggers
- `worker/src/auth.ts`、`sheets.ts`：已清空（待你本機 `git rm`）
- `frontend/vite.config.ts`：base 改 `/`
- `.github/workflows/*.yml`：兩支都改 DEPRECATED（停排程）
- investment-judgement：`scripts/sync_positions.py`（新）、`daily_research.py`（總淨值推估）、`config/portfolio.yaml`（integration 區塊）、排程 prompt（加同步步驟）

---

## 部署步驟（照順序）

### 步驟 1：建 D1 並套 schema
```bash
cd asset-management/worker
wrangler d1 create asset-management-db      # 複製印出的 database_id
```
把 `database_id` 貼進 `wrangler.toml` 的 `database_id = "PASTE_DATABASE_ID_HERE"`，然後：
```bash
wrangler d1 execute asset-management-db --remote --file=./schema.sql
```

### 步驟 2：設 secrets 並部署 Worker
```bash
wrangler secret put API_KEY        # 貼原本那把 Sweslo17@AssetManagement2026
wrangler secret put READ_TOKEN     # 貼一個新的長亂數（給 judgement，跟上面不同）
wrangler deploy
```
驗證唯讀端點（換成你的 READ_TOKEN）：
```bash
curl "https://asset-management-api.asset-management-api.workers.dev/api/sleeve-summary?token=你的READ_TOKEN"
```
D1 還空 → 預期回 `{"total_net_worth_twd":0,...,"sleeve":[]}`。能回 JSON 即通。

### 步驟 3：建初始資料（已備妥，直接跑）
`worker/seed-initial.sql` 已含：VOO/UPRO/TQQQ/BOXX（sleeve）＋ 0050.TW 28000 股（非 sleeve 核心），
成本基準採 2026-06-12 市價，並一併 seed 當日價格與匯率（sleeve-summary 立即可估值）。
```bash
cd asset-management/worker
wrangler d1 execute asset-management-db --remote --file=./seed-initial.sql
```
驗證（換成你的 READ_TOKEN）：
```bash
curl "https://asset-management-api.asset-management-api.workers.dev/api/sleeve-summary?token=你的READ_TOKEN"
```
預期：總淨值約 TWD 6,898,366（≈ $218,199），sleeve ≈ $127,907（佔 58.6%）。

### 步驟 4：前端上 Cloudflare Pages
1. Cloudflare Dashboard → Workers & Pages → Create → Pages → **Connect to Git** → 選此 repo。
2. 建置設定：
   - Framework preset：None（或 Vite）
   - Build command：`npm run build`
   - Build output directory：`dist`
   - Root directory：`frontend`
3. Environment variables 加：`VITE_API_BASE_URL = https://asset-management-api.asset-management-api.workers.dev`
4. Deploy → 得到 `https://asset-management.pages.dev`。
5. 開啟，用 AuthGate 輸入 API_KEY 確認能讀資料。

### 步驟 5：Cloudflare Access（保護「特定的人」）
1. Dashboard → **Zero Trust**（首次建 team 名稱，如 `roger`）。
2. Access → Applications → Add → **Self-hosted**。
3. Application domain：`asset-management.pages.dev`。
4. Add policy：name `allowed-users`、Action Allow、Include → Emails → 你（與要分享的人）的 email。
5. 身分提供者用 One-time PIN 或 Google。存檔。
   - 此後開 Pages 網址需登入、只白名單 email 進得去。
   - 唯讀端點 `/api/sleeve-summary` 在 Worker 網域、走自己的 token，不受此 Access 影響（不用設 bypass）。

### 步驟 6：接上 investment-judgement
把步驟 2 的 READ_TOKEN 貼進 `investment-judgement/config/portfolio.yaml`：
```yaml
integration:
  sleeve_summary_url: "https://asset-management-api.asset-management-api.workers.dev/api/sleeve-summary?token=<貼這裡>"
```
貼好後，judgement 每日排程的步驟 1.5 會自動抓 sleeve-summary、同步 positions、寫 networth.json，退休推估自動升級到總淨值。（在你貼之前，URL 仍含 PASTE_READ_TOKEN，排程會自動跳過、維持 sleeve-only，安全。）

### 步驟 7：清除舊資料
1. **Google Sheets**：確認新系統 OK 後，到 Google Drive 刪除/封存舊試算表。
2. **舊 Worker secrets**：`wrangler secret delete GOOGLE_SERVICE_ACCOUNT_JSON` 與 `GOOGLE_SHEETS_ID`。
3. **GitHub**：repo Settings → Pages → Source 設 None；刪除 Actions secrets `GOOGLE_SERVICE_ACCOUNT_JSON`、`GOOGLE_SHEETS_ID`；本機 `git rm worker/src/auth.ts worker/src/sheets.ts scripts/`（價格腳本已退役）後 commit。
4. **舊前端**：GitHub Pages 停用後，舊 `sweslo17.github.io/asset-management` 即失效。

---

## 驗收檢查
- [ ] `/api/sleeve-summary?token=` 回 JSON
- [ ] Pages 網址需 Access 登入、白名單 email 進得去
- [ ] 前端能新增/讀取持倉（D1）
- [ ] Worker cron 隔日有更新 prices（看 D1 或 Worker logs）
- [ ] judgement 排程貼 token 後，dashboard 退休推估顯示「總淨值」且數字合理

## 回滾
- 每步獨立；舊系統（Sheets+GitHub Pages）在步驟 7 前都還在，驗證 OK 才清。
- D1 備份：`wrangler d1 export asset-management-db --remote --output=backup.sql`。
