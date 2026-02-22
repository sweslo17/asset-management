import type {
  Batch,
  FundingSource,
  Investment,
  PriceRecord,
  ExchangeRate,
} from '@/api/types';
import { investmentCostTWD, investmentMarketValueTWD } from './currency';
import { findPrice, findExchangeRate } from './dateUtils';

/** Tracks unit allocations per source */
export interface SourceUnits {
  sourceName: string;
  units: number;
  investedAmount: number; // total TWD invested by this source
}

/** Tracks unit allocations per batch */
export interface BatchUnits {
  batchId: string;
  units: number;
  totalFunded: number; // total TWD funded in this batch
}

/** Complete NAV state at a point in time */
export interface NavState {
  totalUnits: number;
  cash: number; // cumulative funded - cumulative invested cost
  sourceUnits: SourceUnits[];
  batchUnits: BatchUnits[];
}

/**
 * Build the NAV state by processing all batches chronologically.
 * This replays the history of funding events to determine how many
 * "units" each source and batch holds.
 */
export function buildNavState(
  batches: Batch[],
  fundingSources: FundingSource[],
  investments: Investment[],
  prices: PriceRecord[],
  exchangeRates: ExchangeRate[],
): NavState {
  // Sort batches by date
  const sortedBatches = [...batches].sort((a, b) => a.date.localeCompare(b.date));

  let totalUnits = 0;
  let cash = 0;
  const sourceUnitsMap = new Map<string, SourceUnits>();
  const batchUnitsList: BatchUnits[] = [];

  for (const batch of sortedBatches) {
    // Get funding sources for this batch
    const batchSources = fundingSources.filter((fs) => fs.batch_id === batch.batch_id);
    const totalFunded = batchSources.reduce((sum, fs) => sum + fs.amount_twd, 0);

    // Get investments for this batch
    const batchInvestments = investments.filter((inv) => inv.batch_id === batch.batch_id);
    const totalInvestmentCost = batchInvestments.reduce(
      (sum, inv) => sum + investmentCostTWD(inv),
      0,
    );

    // Calculate pool value at batch date (before this batch's money enters)
    // = market value of ALL investments bought in earlier batches + cash
    const earlierInvestments = investments.filter((inv) => {
      const invBatch = batches.find((b) => b.batch_id === inv.batch_id);
      return invBatch && invBatch.date < batch.date;
    });
    // Also include investments from same-date batches that were processed earlier
    const sameDateEarlierInvestments = investments.filter((inv) => {
      const invBatch = batches.find((b) => b.batch_id === inv.batch_id);
      if (!invBatch || invBatch.date !== batch.date) return false;
      return sortedBatches.indexOf(invBatch) < sortedBatches.indexOf(batch);
    });
    const allPriorInvestments = [...earlierInvestments, ...sameDateEarlierInvestments];

    let investmentValue = 0;
    for (const inv of allPriorInvestments) {
      const price = findPrice(prices, inv.ticker, batch.date);
      if (price === null) continue;
      const usdTwd =
        inv.market === 'US'
          ? (findExchangeRate(exchangeRates, batch.date) ?? inv.exchange_rate)
          : 1;
      investmentValue += investmentMarketValueTWD(inv, price, usdTwd);
    }

    const poolValue = investmentValue + cash;

    // Calculate NAV
    const nav = totalUnits === 0 ? 1.0 : poolValue / totalUnits;

    // Issue new units
    const newUnits = totalFunded / nav;

    // Record per-source units
    for (const src of batchSources) {
      const srcUnits = src.amount_twd / nav;
      const existing = sourceUnitsMap.get(src.source_name);
      if (existing) {
        existing.units += srcUnits;
        existing.investedAmount += src.amount_twd;
      } else {
        sourceUnitsMap.set(src.source_name, {
          sourceName: src.source_name,
          units: srcUnits,
          investedAmount: src.amount_twd,
        });
      }
    }

    // Record per-batch units
    batchUnitsList.push({
      batchId: batch.batch_id,
      units: newUnits,
      totalFunded,
    });

    // Update totals
    totalUnits += newUnits;
    cash += totalFunded - totalInvestmentCost;
  }

  return {
    totalUnits,
    cash,
    sourceUnits: Array.from(sourceUnitsMap.values()),
    batchUnits: batchUnitsList,
  };
}

/** Calculate current NAV given portfolio state and target date prices */
export function calculateNav(
  investments: Investment[],
  prices: PriceRecord[],
  exchangeRates: ExchangeRate[],
  targetDate: string,
  cash: number,
  totalUnits: number,
): number {
  if (totalUnits === 0) return 1.0;

  let investmentValue = 0;
  for (const inv of investments) {
    const price = findPrice(prices, inv.ticker, targetDate);
    if (price === null) continue;
    const usdTwd =
      inv.market === 'US'
        ? (findExchangeRate(exchangeRates, targetDate) ?? inv.exchange_rate)
        : 1;
    investmentValue += investmentMarketValueTWD(inv, price, usdTwd);
  }

  return (investmentValue + cash) / totalUnits;
}
