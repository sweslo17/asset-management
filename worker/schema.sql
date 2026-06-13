-- ============================================================
-- Asset Management — Cloudflare D1 schema
-- 取代原 Google Sheets 後端。對應 worker/src/types.ts 的介面。
-- 套用： wrangler d1 execute asset-management-db --file=./schema.sql
-- ============================================================

PRAGMA foreign_keys = ON;

-- 投資批次（一次買進的群組）
CREATE TABLE IF NOT EXISTS batches (
  batch_id    TEXT PRIMARY KEY,
  date        TEXT NOT NULL,            -- ISO yyyy-mm-dd
  description TEXT NOT NULL DEFAULT ''
);

-- 批次的資金來源
CREATE TABLE IF NOT EXISTS funding_sources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id    TEXT NOT NULL,
  source_name TEXT NOT NULL,
  amount_twd  REAL NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES batches(batch_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_funding_batch ON funding_sources(batch_id);

-- 單筆投資交易
CREATE TABLE IF NOT EXISTS investments (
  id             TEXT PRIMARY KEY,
  batch_id       TEXT NOT NULL,
  ticker         TEXT NOT NULL,
  name           TEXT NOT NULL DEFAULT '',
  market         TEXT NOT NULL CHECK (market IN ('TW','US')),
  date           TEXT NOT NULL,
  units          REAL NOT NULL,         -- 可為負（賣出/再平衡）
  price_per_unit REAL NOT NULL,
  exchange_rate  REAL NOT NULL DEFAULT 1,
  fees           REAL NOT NULL DEFAULT 0,
  tags           TEXT NOT NULL DEFAULT '',  -- 逗號分隔
  txn_type       TEXT NOT NULL DEFAULT 'buy' CHECK (txn_type IN ('buy','sell','rebalance')),
  FOREIGN KEY (batch_id) REFERENCES batches(batch_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_inv_batch  ON investments(batch_id);
CREATE INDEX IF NOT EXISTS idx_inv_ticker ON investments(ticker);

-- 歷史收盤價
CREATE TABLE IF NOT EXISTS prices (
  ticker TEXT NOT NULL,
  date   TEXT NOT NULL,
  close  REAL NOT NULL,
  PRIMARY KEY (ticker, date)
);

-- 每日 USD/TWD 匯率
CREATE TABLE IF NOT EXISTS exchange_rates (
  date    TEXT PRIMARY KEY,
  usd_twd REAL NOT NULL
);

-- 一般 key/value metadata
CREATE TABLE IF NOT EXISTS metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- 每 ticker 的維度標籤（strategy / region / 等）
CREATE TABLE IF NOT EXISTS ticker_tags (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker    TEXT NOT NULL,
  dimension TEXT NOT NULL,
  tag       TEXT NOT NULL,
  UNIQUE (ticker, dimension)
);
CREATE INDEX IF NOT EXISTS idx_tags_dim ON ticker_tags(dimension);

-- ============================================================
-- 預設資料：strategy 維度標記槓桿 sleeve（供 investment-judgement 篩選）
-- ============================================================
INSERT OR IGNORE INTO ticker_tags (ticker, dimension, tag) VALUES
  ('VOO',  'strategy', 'leverage-sleeve'),
  ('UPRO', 'strategy', 'leverage-sleeve'),
  ('QQQ',  'strategy', 'leverage-sleeve'),
  ('TQQQ', 'strategy', 'leverage-sleeve'),
  ('BOXX', 'strategy', 'leverage-sleeve');
