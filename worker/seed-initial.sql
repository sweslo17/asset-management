-- ============================================================
-- 初始持倉 seed（2026-06-12）
-- 套用： wrangler d1 execute asset-management-db --remote --file=./seed-initial.sql
-- 成本基準採當日市價（P&L 從 0 起算）。價格/匯率一併寫入，讓 sleeve-summary 立即可估值。
-- sleeve（VOO/UPRO/TQQQ/BOXX）由 schema.sql 的 strategy 標籤標記；0050.TW 未標記=非 sleeve 核心。
-- ============================================================

-- 批次
INSERT INTO batches (batch_id, date, description) VALUES
  ('BATCH-001', '2026-06-12', '初始持倉匯入（重分配後 + 台股核心）');

-- 資金來源（TWD，約略）
INSERT INTO funding_sources (batch_id, source_name, amount_twd) VALUES
  ('BATCH-001', '美股槓桿 sleeve（Firstrade）', 4043917),
  ('BATCH-001', '台股核心（0050）', 2854600);

-- 投資（US 匯率 31.615；TW 匯率 1）
INSERT INTO investments (id, batch_id, ticker, name, market, date, units, price_per_unit, exchange_rate, fees, tags, txn_type) VALUES
  ('INV-001', 'BATCH-001', 'VOO',     'Vanguard S&P 500 ETF',          'US', '2026-06-12', 65.91297,  681.46,  31.615, 0, '', 'buy'),
  ('INV-002', 'BATCH-001', 'UPRO',    'ProShares UltraPro S&P 500',    'US', '2026-06-12', 185.22054, 137.72,  31.615, 0, '', 'buy'),
  ('INV-003', 'BATCH-001', 'TQQQ',    'ProShares UltraPro QQQ',        'US', '2026-06-12', 340.13867, 76.115,  31.615, 0, '', 'buy'),
  ('INV-004', 'BATCH-001', 'BOXX',    'Alpha Architect 1-3M Box ETF',  'US', '2026-06-12', 270.0224,  116.995, 31.615, 0, '', 'buy'),
  ('INV-005', 'BATCH-001', '0050.TW', '元大台灣50',                     'TW', '2026-06-12', 28000,     101.95,  1,      0, '', 'buy');

-- 最新價格（讓 sleeve-summary 立即可估值；之後 cron 自動更新）
INSERT INTO prices (ticker, date, close) VALUES
  ('VOO',     '2026-06-12', 681.46),
  ('UPRO',    '2026-06-12', 137.72),
  ('TQQQ',    '2026-06-12', 76.115),
  ('BOXX',    '2026-06-12', 116.995),
  ('0050.TW', '2026-06-12', 101.95)
ON CONFLICT(ticker, date) DO UPDATE SET close=excluded.close;

-- 最新匯率
INSERT INTO exchange_rates (date, usd_twd) VALUES
  ('2026-06-12', 31.615)
ON CONFLICT(date) DO UPDATE SET usd_twd=excluded.usd_twd;

-- metadata
INSERT INTO metadata (key, value) VALUES ('last_update', '2026-06-12T00:00:00Z')
ON CONFLICT(key) DO UPDATE SET value=excluded.value;

-- 0050.TW 明確標記為非 sleeve（core），方便日後在 UI 分類（可選）
INSERT INTO ticker_tags (ticker, dimension, tag) VALUES ('0050.TW', 'strategy', 'core-long-term')
ON CONFLICT(ticker, dimension) DO UPDATE SET tag=excluded.tag;
