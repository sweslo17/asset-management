import type {
  Investment,
  PriceRecord,
  ExchangeRate,
  Batch,
  FundingSource,
  TickerTag,
} from '@/api/types';
import { investmentCostTWD, investmentMarketValueTWD } from './currency';
import { findPrice, findExchangeRate, parseTags } from './dateUtils';
import { calculateSourceAllocations } from './proportionalCalculator';
import type { FundingSourceAllocation, SourceHolding } from './proportionalCalculator';

// Re-export proportional calculator types and function
export type { FundingSourceAllocation, SourceHolding };
export { calculateSourceAllocations };

/** Individual investment with calculated values */
export interface InvestmentWithValue extends Investment {
  costTWD: number;
  marketValueTWD: number;
  profitTWD: number;
  profitPercent: number;
}

/** Calculate value for each investment */
export function calculateInvestmentValues(
  investments: Investment[],
  prices: PriceRecord[],
  exchangeRates: ExchangeRate[],
  targetDate: string,
): InvestmentWithValue[] {
  return investments.map((inv) => {
    const costTWD = investmentCostTWD(inv);
    const price = findPrice(prices, inv.ticker, targetDate);
    const usdTwd =
      inv.market === 'US'
        ? (findExchangeRate(exchangeRates, targetDate) ?? inv.exchange_rate)
        : 1;
    const marketValueTWD =
      price !== null ? investmentMarketValueTWD(inv, price, usdTwd) : costTWD;
    const profitTWD = marketValueTWD - costTWD;
    const profitPercent = costTWD !== 0 ? profitTWD / costTWD : 0;

    return { ...inv, costTWD, marketValueTWD, profitTWD, profitPercent };
  });
}

/** Category (tag) summary */
export interface CategorySummary {
  tag: string;
  investments: InvestmentWithValue[];
  totalCost: number;
  totalValue: number;
  totalProfit: number;
  profitPercent: number;
}

/** Group investments by tag */
export function calculateCategorySummary(
  investmentsWithValue: InvestmentWithValue[],
): CategorySummary[] {
  const tagMap = new Map<string, InvestmentWithValue[]>();
  for (const inv of investmentsWithValue) {
    const tags = parseTags(inv.tags);
    if (tags.length === 0) tags.push('未分類');
    for (const tag of tags) {
      const list = tagMap.get(tag) ?? [];
      list.push(inv);
      tagMap.set(tag, list);
    }
  }

  return Array.from(tagMap.entries())
    .map(([tag, investments]) => {
      const totalCost = investments.reduce((s, i) => s + i.costTWD, 0);
      const totalValue = investments.reduce((s, i) => s + i.marketValueTWD, 0);
      const totalProfit = totalValue - totalCost;
      const profitPercent = totalCost !== 0 ? totalProfit / totalCost : 0;
      return { tag, investments, totalCost, totalValue, totalProfit, profitPercent };
    })
    .sort((a, b) => b.totalValue - a.totalValue);
}

/** A single group within a dimension analysis */
export interface DimensionGroup {
  tag: string;
  tickers: string[];
  totalValue: number;
  totalCost: number;
  totalProfit: number;
  profitPercent: number;
}

/** Calculate dimension-based summary by grouping investments via ticker_tags */
export function calculateDimensionSummary(
  investmentsWithValue: InvestmentWithValue[],
  tickerTags: TickerTag[],
  dimension: string,
): DimensionGroup[] {
  // Build ticker → tag lookup for the specified dimension
  const tickerToTag = new Map<string, string>();
  for (const tt of tickerTags) {
    if (tt.dimension === dimension) {
      tickerToTag.set(tt.ticker, tt.tag);
    }
  }

  // First aggregate investments by ticker
  const tickerAgg = new Map<string, { cost: number; value: number; ticker: string }>();
  for (const inv of investmentsWithValue) {
    const existing = tickerAgg.get(inv.ticker);
    if (existing) {
      existing.cost += inv.costTWD;
      existing.value += inv.marketValueTWD;
    } else {
      tickerAgg.set(inv.ticker, {
        ticker: inv.ticker,
        cost: inv.costTWD,
        value: inv.marketValueTWD,
      });
    }
  }

  // Group by tag
  const tagMap = new Map<string, { tickers: Set<string>; cost: number; value: number }>();
  for (const [ticker, agg] of tickerAgg) {
    const tag = tickerToTag.get(ticker) ?? '未分類';
    const group = tagMap.get(tag) ?? { tickers: new Set(), cost: 0, value: 0 };
    group.tickers.add(ticker);
    group.cost += agg.cost;
    group.value += agg.value;
    tagMap.set(tag, group);
  }

  return Array.from(tagMap.entries())
    .map(([tag, group]) => {
      const totalProfit = group.value - group.cost;
      return {
        tag,
        tickers: Array.from(group.tickers),
        totalValue: group.value,
        totalCost: group.cost,
        totalProfit,
        profitPercent: group.cost !== 0 ? totalProfit / group.cost : 0,
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue);
}

/** Funding source summary — now an alias for FundingSourceAllocation */
export type FundingSourceSummary = FundingSourceAllocation;

/** Per-batch summary with proportional allocation */
export interface BatchSummary {
  batchId: string;
  date: string;
  description: string;
  totalFunded: number;
  totalCostTWD: number;
  currentValue: number;
  profit: number;
  profitPercent: number;
  sources: { sourceName: string; amount: number; proportion: number }[];
  investments: InvestmentWithValue[];
}

/** Calculate per-batch summary using proportional model */
export function calculateBatchSummary(
  batches: Batch[],
  fundingSources: FundingSource[],
  investments: Investment[],
  prices: PriceRecord[],
  exchangeRates: ExchangeRate[],
  targetDate: string,
): BatchSummary[] {
  return batches.map((batch) => {
    const batchSources = fundingSources.filter((fs) => fs.batch_id === batch.batch_id);
    const totalFunded = batchSources.reduce((sum, fs) => sum + fs.amount_twd, 0);

    const batchInvestments = investments.filter((inv) => inv.batch_id === batch.batch_id);
    const investmentsWithValue = calculateInvestmentValues(batchInvestments, prices, exchangeRates, targetDate);

    const totalCostTWD = investmentsWithValue.reduce((sum, inv) => sum + inv.costTWD, 0);
    const totalMarketValue = investmentsWithValue.reduce((sum, inv) => sum + inv.marketValueTWD, 0);
    const uninvestedCash = totalFunded - totalCostTWD;
    const currentValue = totalMarketValue + uninvestedCash;
    const profit = currentValue - totalFunded;
    const profitPercent = totalFunded !== 0 ? profit / totalFunded : 0;

    const sources = batchSources.map((fs) => ({
      sourceName: fs.source_name,
      amount: fs.amount_twd,
      proportion: totalFunded !== 0 ? fs.amount_twd / totalFunded : 0,
    }));

    return {
      batchId: batch.batch_id,
      date: batch.date,
      description: batch.description,
      totalFunded,
      totalCostTWD,
      currentValue,
      profit,
      profitPercent,
      sources,
      investments: investmentsWithValue,
    };
  });
}

/** Profit/Loss for a date range */
export interface ProfitLossItem {
  ticker: string;
  name: string;
  market: 'TW' | 'US';
  startValue: number;
  endValue: number;
  profit: number;
  profitPercent: number;
}

/** Calculate profit/loss for each holding between two dates */
export function calculateProfitLoss(
  investments: Investment[],
  prices: PriceRecord[],
  exchangeRates: ExchangeRate[],
  startDate: string,
  endDate: string,
): ProfitLossItem[] {
  // Group by ticker, excluding investments bought after endDate
  const tickerMap = new Map<string, Investment[]>();
  for (const inv of investments) {
    if (inv.date > endDate) continue;
    const list = tickerMap.get(inv.ticker) ?? [];
    list.push(inv);
    tickerMap.set(inv.ticker, list);
  }

  return Array.from(tickerMap.entries()).map(([ticker, invs]) => {
    const first = invs[0];
    let startValue = 0;
    let endValue = 0;

    for (const inv of invs) {
      const startPrice = findPrice(prices, inv.ticker, startDate);
      const endPrice = findPrice(prices, inv.ticker, endDate);
      const startUsdTwd =
        inv.market === 'US'
          ? (findExchangeRate(exchangeRates, startDate) ?? inv.exchange_rate)
          : 1;
      const endUsdTwd =
        inv.market === 'US'
          ? (findExchangeRate(exchangeRates, endDate) ?? inv.exchange_rate)
          : 1;

      // If bought after startDate, use cost as start value
      if (inv.date > startDate) {
        startValue += investmentCostTWD(inv);
      } else if (startPrice !== null) {
        startValue += investmentMarketValueTWD(inv, startPrice, startUsdTwd);
      } else {
        // No price data for start date, fall back to cost
        startValue += investmentCostTWD(inv);
      }

      if (endPrice !== null) {
        endValue += investmentMarketValueTWD(inv, endPrice, endUsdTwd);
      } else {
        endValue += investmentCostTWD(inv);
      }
    }

    const profit = endValue - startValue;
    const profitPercent = startValue !== 0 ? profit / startValue : 0;

    return {
      ticker,
      name: first.name,
      market: first.market,
      startValue,
      endValue,
      profit,
      profitPercent,
    };
  });
}

/** A single data point for portfolio time series */
export interface TimeSeriesPoint {
  date: string;
  totalValue: number;  // sum of market values (TWD)
  totalCost: number;   // sum of investment costs (TWD)
}

/** Generate portfolio value/cost time series from investment and price dates */
export function generatePortfolioTimeSeries(
  investments: Investment[],
  prices: PriceRecord[],
  exchangeRates: ExchangeRate[],
  startDate?: string,
  endDate?: string,
): TimeSeriesPoint[] {
  // Collect unique dates from both prices and investments
  // This ensures the chart starts from the first investment date,
  // even before price data exists (fallback to cost as market value)
  const dateSet = new Set<string>();
  for (const p of prices) {
    dateSet.add(p.date);
  }
  for (const inv of investments) {
    dateSet.add(inv.date);
  }

  let dates = Array.from(dateSet).sort();

  // Filter to date range if specified
  if (startDate) dates = dates.filter((d) => d >= startDate);
  if (endDate) dates = dates.filter((d) => d <= endDate);

  // Compute values for dates where we have data
  const sparse = dates.map((date) => {
    const activeInvestments = investments.filter((inv) => inv.date <= date);
    const valued = calculateInvestmentValues(activeInvestments, prices, exchangeRates, date);

    const totalValue = valued.reduce((sum, inv) => sum + inv.marketValueTWD, 0);
    const totalCost = valued.reduce((sum, inv) => sum + inv.costTWD, 0);

    return { date, totalValue, totalCost };
  });

  if (sparse.length === 0) return [];

  // Fill daily gaps by carrying forward the last known value
  const filled: TimeSeriesPoint[] = [];
  for (let i = 0; i < sparse.length; i++) {
    filled.push(sparse[i]);
    if (i < sparse.length - 1) {
      const current = new Date(sparse[i].date);
      const next = new Date(sparse[i + 1].date);
      current.setDate(current.getDate() + 1);
      while (current < next) {
        filled.push({
          date: current.toISOString().slice(0, 10),
          totalValue: sparse[i].totalValue,
          totalCost: sparse[i].totalCost,
        });
        current.setDate(current.getDate() + 1);
      }
    }
  }

  return filled;
}
