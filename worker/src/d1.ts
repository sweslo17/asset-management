/**
 * Cloudflare D1 data-access layer.
 * 取代原本的 Google Sheets (sheets.ts)。全部操作以 SQL by primary key 完成。
 */

import type {
  Batch,
  FundingSource,
  Investment,
  Metadata,
  PortfolioData,
  PriceRecord,
  ExchangeRate,
  TickerTag,
} from './types';

type DB = D1Database;

// ---------------------------------------------------------------------------
// 讀取完整 portfolio
// ---------------------------------------------------------------------------

export async function getPortfolio(db: DB): Promise<PortfolioData> {
  const [batches, funding, investments, prices, rates, metadata, tags] =
    await Promise.all([
      db.prepare('SELECT batch_id, date, description FROM batches ORDER BY date, batch_id').all<Batch>(),
      db.prepare('SELECT batch_id, source_name, amount_twd FROM funding_sources').all<FundingSource>(),
      db.prepare(
        'SELECT id, batch_id, ticker, name, market, date, units, price_per_unit, exchange_rate, fees, tags FROM investments ORDER BY date, id',
      ).all<Investment>(),
      db.prepare('SELECT ticker, date, close FROM prices').all<PriceRecord>(),
      db.prepare('SELECT date, usd_twd FROM exchange_rates').all<ExchangeRate>(),
      db.prepare('SELECT key, value FROM metadata').all<Metadata>(),
      db.prepare('SELECT ticker, dimension, tag FROM ticker_tags').all<TickerTag>(),
    ]);

  return {
    batches: batches.results ?? [],
    funding_sources: funding.results ?? [],
    investments: investments.results ?? [],
    prices: prices.results ?? [],
    exchange_rates: rates.results ?? [],
    metadata: metadata.results ?? [],
    ticker_tags: tags.results ?? [],
  };
}

// ---------------------------------------------------------------------------
// ID 產生：查目前最大的 PREFIX-NNN 編號
// ---------------------------------------------------------------------------

async function nextId(db: DB, table: 'batches' | 'investments', col: string, prefix: string): Promise<string> {
  const rows = await db.prepare(`SELECT ${col} AS id FROM ${table} WHERE ${col} LIKE ?`).bind(`${prefix}-%`).all<{ id: string }>();
  let max = 0;
  for (const r of rows.results ?? []) {
    const m = r.id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m && m[1]) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// 建立 batch（含 funding sources 與 investments），用 D1 batch 交易
// ---------------------------------------------------------------------------

export async function createBatch(
  db: DB,
  batchInput: { date: string; description: string },
  fundingInput: Array<{ source_name: string; amount_twd: number }>,
  investmentsInput: Array<Omit<Investment, 'id' | 'batch_id'>>,
): Promise<{ batch: Batch; funding_sources: FundingSource[]; investments: Investment[] }> {
  const batchId = await nextId(db, 'batches', 'batch_id', 'BATCH');
  const baseInvId = await nextId(db, 'investments', 'id', 'INV');
  const baseNum = parseInt(baseInvId.split('-')[1] ?? '1', 10);

  const batch: Batch = { batch_id: batchId, date: batchInput.date, description: batchInput.description };
  const funding_sources: FundingSource[] = fundingInput.map((fs) => ({ batch_id: batchId, ...fs }));
  const investments: Investment[] = investmentsInput.map((inv, i) => ({
    ...inv,
    id: `INV-${String(baseNum + i).padStart(3, '0')}`,
    batch_id: batchId,
  }));

  const stmts: D1PreparedStatement[] = [
    db.prepare('INSERT INTO batches (batch_id, date, description) VALUES (?, ?, ?)').bind(
      batch.batch_id, batch.date, batch.description),
  ];
  for (const fs of funding_sources) {
    stmts.push(db.prepare('INSERT INTO funding_sources (batch_id, source_name, amount_twd) VALUES (?, ?, ?)')
      .bind(fs.batch_id, fs.source_name, fs.amount_twd));
  }
  for (const inv of investments) {
    stmts.push(db.prepare(
      `INSERT INTO investments (id, batch_id, ticker, name, market, date, units, price_per_unit, exchange_rate, fees, tags, txn_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(inv.id, inv.batch_id, inv.ticker, inv.name, inv.market, inv.date,
      inv.units, inv.price_per_unit, inv.exchange_rate, inv.fees, inv.tags,
      (inv as Investment & { txn_type?: string }).txn_type ?? 'buy'));
  }
  await db.batch(stmts);
  return { batch, funding_sources, investments };
}

// ---------------------------------------------------------------------------
// 更新 / 刪除 investment
// ---------------------------------------------------------------------------

export async function getInvestment(db: DB, id: string): Promise<Investment | null> {
  return await db.prepare(
    'SELECT id, batch_id, ticker, name, market, date, units, price_per_unit, exchange_rate, fees, tags FROM investments WHERE id = ?',
  ).bind(id).first<Investment>();
}

export async function updateInvestment(db: DB, merged: Investment): Promise<void> {
  await db.prepare(
    `UPDATE investments SET batch_id=?, ticker=?, name=?, market=?, date=?, units=?, price_per_unit=?, exchange_rate=?, fees=?, tags=? WHERE id=?`,
  ).bind(merged.batch_id, merged.ticker, merged.name, merged.market, merged.date,
    merged.units, merged.price_per_unit, merged.exchange_rate, merged.fees, merged.tags, merged.id).run();
}

export async function deleteInvestment(db: DB, id: string): Promise<void> {
  await db.prepare('DELETE FROM investments WHERE id = ?').bind(id).run();
}

// ---------------------------------------------------------------------------
// 更新 / 刪除 batch
// ---------------------------------------------------------------------------

export async function getBatch(db: DB, id: string): Promise<Batch | null> {
  return await db.prepare('SELECT batch_id, date, description FROM batches WHERE batch_id = ?').bind(id).first<Batch>();
}

export async function updateBatch(db: DB, merged: Batch): Promise<void> {
  await db.prepare('UPDATE batches SET date=?, description=? WHERE batch_id=?')
    .bind(merged.date, merged.description, merged.batch_id).run();
}

export async function deleteBatch(db: DB, id: string): Promise<{ investments: number; funding: number }> {
  const inv = await db.prepare('SELECT COUNT(*) AS n FROM investments WHERE batch_id=?').bind(id).first<{ n: number }>();
  const fs = await db.prepare('SELECT COUNT(*) AS n FROM funding_sources WHERE batch_id=?').bind(id).first<{ n: number }>();
  // ON DELETE CASCADE 會清掉子表
  await db.prepare('DELETE FROM batches WHERE batch_id=?').bind(id).run();
  return { investments: inv?.n ?? 0, funding: fs?.n ?? 0 };
}

// ---------------------------------------------------------------------------
// ticker tags
// ---------------------------------------------------------------------------

export async function upsertTickerTags(db: DB, assignments: TickerTag[]): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  for (const a of assignments) {
    if (!a.tag) {
      stmts.push(db.prepare('DELETE FROM ticker_tags WHERE ticker=? AND dimension=?').bind(a.ticker, a.dimension));
    } else {
      stmts.push(db.prepare(
        `INSERT INTO ticker_tags (ticker, dimension, tag) VALUES (?, ?, ?)
         ON CONFLICT(ticker, dimension) DO UPDATE SET tag=excluded.tag`,
      ).bind(a.ticker, a.dimension, a.tag));
    }
  }
  if (stmts.length) await db.batch(stmts);
}

export async function deleteDimension(db: DB, name: string): Promise<number> {
  const res = await db.prepare('DELETE FROM ticker_tags WHERE dimension=?').bind(name).run();
  return res.meta.changes ?? 0;
}

export async function renameDimension(db: DB, name: string, newName: string): Promise<number> {
  const res = await db.prepare('UPDATE ticker_tags SET dimension=? WHERE dimension=?').bind(newName, name).run();
  return res.meta.changes ?? 0;
}

// ---------------------------------------------------------------------------
// 價格 / 匯率（backfill 與價格腳本用）
// ---------------------------------------------------------------------------

export async function getEarliestDatesByTicker(db: DB): Promise<Map<string, string>> {
  const rows = await db.prepare('SELECT ticker, MIN(date) AS d FROM investments GROUP BY ticker').all<{ ticker: string; d: string }>();
  const m = new Map<string, string>();
  for (const r of rows.results ?? []) if (r.ticker && r.d) m.set(r.ticker, r.d);
  return m;
}

export async function getExistingPriceKeys(db: DB): Promise<Set<string>> {
  const rows = await db.prepare('SELECT ticker, date FROM prices').all<{ ticker: string; date: string }>();
  const s = new Set<string>();
  for (const r of rows.results ?? []) s.add(`${r.ticker}|${r.date}`);
  return s;
}

export async function getExistingRateDates(db: DB): Promise<Set<string>> {
  const rows = await db.prepare('SELECT date FROM exchange_rates').all<{ date: string }>();
  const s = new Set<string>();
  for (const r of rows.results ?? []) s.add(r.date);
  return s;
}

/** 以 UPSERT 寫入（重複的 ticker+date / date 會覆蓋），供 backfill 與每日價格腳本共用 */
export async function upsertPrices(db: DB, recs: PriceRecord[]): Promise<number> {
  if (!recs.length) return 0;
  const stmts = recs.map((r) =>
    db.prepare('INSERT INTO prices (ticker, date, close) VALUES (?, ?, ?) ON CONFLICT(ticker, date) DO UPDATE SET close=excluded.close')
      .bind(r.ticker, r.date, r.close));
  await db.batch(stmts);
  return recs.length;
}

export async function upsertRates(db: DB, recs: ExchangeRate[]): Promise<number> {
  if (!recs.length) return 0;
  const stmts = recs.map((r) =>
    db.prepare('INSERT INTO exchange_rates (date, usd_twd) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET usd_twd=excluded.usd_twd')
      .bind(r.date, r.usd_twd));
  await db.batch(stmts);
  return recs.length;
}

// ---------------------------------------------------------------------------
// sleeve summary（給 investment-judgement 的唯讀摘要）
// ---------------------------------------------------------------------------

export interface SleeveSummary {
  as_of: string;
  total_net_worth_twd: number;
  total_net_worth_usd: number | null;
  usd_twd: number | null;
  sleeve: Array<{ ticker: string; units: number; market: string; value_twd: number }>;
  sleeve_value_twd: number;
  sleeve_fraction: number;
  non_sleeve_value_twd: number;
}

/**
 * 計算 sleeve 持倉與總淨值。
 * sleeve = ticker_tags 中 dimension='strategy' 且 tag='leverage-sleeve' 的標的。
 * 持有單位 = 該 ticker 所有 investments 的 units 加總（含負股數的賣出）。
 */
export async function getSleeveSummary(db: DB): Promise<SleeveSummary> {
  const [holdingsRes, sleeveRes, latestRate] = await Promise.all([
    db.prepare('SELECT ticker, market, SUM(units) AS units FROM investments GROUP BY ticker, market HAVING ABS(SUM(units)) > 1e-9').all<{ ticker: string; market: string; units: number }>(),
    db.prepare("SELECT ticker FROM ticker_tags WHERE dimension='strategy' AND tag='leverage-sleeve'").all<{ ticker: string }>(),
    db.prepare('SELECT date, usd_twd FROM exchange_rates ORDER BY date DESC LIMIT 1').first<{ date: string; usd_twd: number }>(),
  ]);

  const sleeveSet = new Set((sleeveRes.results ?? []).map((r) => r.ticker));
  const usdTwd = latestRate?.usd_twd ?? null;

  // 最新價格：每個 ticker 取最近一筆
  const holdings = holdingsRes.results ?? [];
  const sleeve: SleeveSummary['sleeve'] = [];
  let sleeveVal = 0, nonSleeveVal = 0;

  for (const h of holdings) {
    const px = await db.prepare('SELECT close FROM prices WHERE ticker=? ORDER BY date DESC LIMIT 1').bind(h.ticker).first<{ close: number }>();
    const close = px?.close ?? 0;
    const fx = h.market === 'US' ? (usdTwd ?? 1) : 1;
    const valueTwd = h.units * close * fx;
    if (sleeveSet.has(h.ticker)) {
      sleeve.push({ ticker: h.ticker, units: h.units, market: h.market, value_twd: valueTwd });
      sleeveVal += valueTwd;
    } else {
      nonSleeveVal += valueTwd;
    }
  }

  const total = sleeveVal + nonSleeveVal;
  return {
    as_of: latestRate?.date ?? new Date().toISOString().slice(0, 10),
    total_net_worth_twd: total,
    total_net_worth_usd: usdTwd ? total / usdTwd : null,
    usd_twd: usdTwd,
    sleeve,
    sleeve_value_twd: sleeveVal,
    sleeve_fraction: total > 0 ? sleeveVal / total : 0,
    non_sleeve_value_twd: nonSleeveVal,
  };
}
