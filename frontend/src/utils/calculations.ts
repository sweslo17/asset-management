import type {
  Investment,
  PriceRecord,
  ExchangeRate,
  Batch,
} from '@/api/types';
import { investmentCostTWD, investmentMarketValueTWD } from './currency';
import { findPrice, findExchangeRate, parseTags } from './dateUtils';
import { buildNavState, calculateNav } from './navCalculator';
import type { NavState } from './navCalculator';

// Re-export for consumers that need NavState alongside these helpers
export type { NavState };

// Re-export nav helpers so callers only need this module
export { buildNavState, calculateNav };

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

/** Funding source value/profit */
export interface FundingSourceSummary {
  sourceName: string;
  investedAmount: number;
  currentValue: number;
  profit: number;
  profitPercent: number;
  units: number;
}

/** Calculate per-source value using NAV */
export function calculateFundingSummary(
  navState: NavState,
  currentNav: number,
): FundingSourceSummary[] {
  return navState.sourceUnits.map((su) => {
    const currentValue = su.units * currentNav;
    const profit = currentValue - su.investedAmount;
    const profitPercent = su.investedAmount !== 0 ? profit / su.investedAmount : 0;
    return {
      sourceName: su.sourceName,
      investedAmount: su.investedAmount,
      currentValue,
      profit,
      profitPercent,
      units: su.units,
    };
  });
}

/** Batch profit */
export interface BatchSummary {
  batchId: string;
  date: string;
  description: string;
  totalFunded: number;
  currentValue: number;
  profit: number;
  profitPercent: number;
  units: number;
}

/** Calculate per-batch value using NAV */
export function calculateBatchSummary(
  navState: NavState,
  currentNav: number,
  batches: Batch[],
): BatchSummary[] {
  return navState.batchUnits.map((bu) => {
    const batch = batches.find((b) => b.batch_id === bu.batchId);
    const currentValue = bu.units * currentNav;
    const profit = currentValue - bu.totalFunded;
    const profitPercent = bu.totalFunded !== 0 ? profit / bu.totalFunded : 0;
    return {
      batchId: bu.batchId,
      date: batch?.date ?? '',
      description: batch?.description ?? '',
      totalFunded: bu.totalFunded,
      currentValue,
      profit,
      profitPercent,
      units: bu.units,
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
      }

      if (endPrice !== null) {
        endValue += investmentMarketValueTWD(inv, endPrice, endUsdTwd);
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
