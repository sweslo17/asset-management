import type {
  Batch,
  FundingSource,
  Investment,
  PriceRecord,
  ExchangeRate,
} from '@/api/types';
import { investmentCostTWD } from './currency';
import { findPrice, findExchangeRate } from './dateUtils';

/** A single ticker holding allocated proportionally to a funding source */
export interface SourceHolding {
  ticker: string;
  name: string;
  market: 'TW' | 'US';
  units: number;
  costTWD: number;
  marketValueTWD: number;
  profitTWD: number;
  profitPercent: number;
}

/** Aggregated allocation for one funding source across all batches */
export interface FundingSourceAllocation {
  sourceName: string;
  investedAmount: number;
  totalCostTWD: number;
  uninvestedCash: number;
  currentValue: number;
  profit: number;
  profitPercent: number;
  holdings: SourceHolding[];
}

/**
 * Calculate proportional allocations for each funding source.
 *
 * For each batch, each source's proportion = source.amount_twd / batch_total.
 * Each investment in the batch is split proportionally among sources.
 * Results are aggregated across all batches by source name, with holdings grouped by ticker.
 */
export function calculateSourceAllocations(
  batches: Batch[],
  fundingSources: FundingSource[],
  investments: Investment[],
  prices: PriceRecord[],
  exchangeRates: ExchangeRate[],
  targetDate: string,
): FundingSourceAllocation[] {
  // Accumulator: sourceName -> { investedAmount, holdings: Map<ticker, {units, costTWD, name, market}> }
  const sourceMap = new Map<
    string,
    {
      investedAmount: number;
      totalCostTWD: number;
      holdingsMap: Map<string, { ticker: string; name: string; market: 'TW' | 'US'; units: number; costTWD: number }>;
    }
  >();

  for (const batch of batches) {
    const batchSources = fundingSources.filter((fs) => fs.batch_id === batch.batch_id);
    const batchTotal = batchSources.reduce((sum, fs) => sum + fs.amount_twd, 0);
    if (batchTotal === 0) continue;

    const batchInvestments = investments.filter((inv) => inv.batch_id === batch.batch_id);

    // Initialize source accumulators
    for (const src of batchSources) {
      if (!sourceMap.has(src.source_name)) {
        sourceMap.set(src.source_name, { investedAmount: 0, totalCostTWD: 0, holdingsMap: new Map() });
      }
      sourceMap.get(src.source_name)!.investedAmount += src.amount_twd;
    }

    // Allocate each investment: first N-1 sources by proportion, last source gets remainder
    for (const inv of batchInvestments) {
      const invCost = investmentCostTWD(inv);
      let remainingUnits = inv.units;
      let remainingCost = invCost;

      for (let i = 0; i < batchSources.length; i++) {
        const src = batchSources[i];
        const isLast = i === batchSources.length - 1;
        const sourceAcc = sourceMap.get(src.source_name)!;

        const allocUnits = isLast ? remainingUnits : (src.amount_twd / batchTotal) * inv.units;
        const allocCost = isLast ? remainingCost : (src.amount_twd / batchTotal) * invCost;

        remainingUnits -= allocUnits;
        remainingCost -= allocCost;

        sourceAcc.totalCostTWD += allocCost;

        const existing = sourceAcc.holdingsMap.get(inv.ticker);
        if (existing) {
          existing.units += allocUnits;
          existing.costTWD += allocCost;
        } else {
          sourceAcc.holdingsMap.set(inv.ticker, {
            ticker: inv.ticker,
            name: inv.name,
            market: inv.market,
            units: allocUnits,
            costTWD: allocCost,
          });
        }
      }
    }
  }

  // Build final result with market values
  const result: FundingSourceAllocation[] = [];

  for (const [sourceName, acc] of sourceMap) {
    const holdings: SourceHolding[] = [];
    let totalMarketValue = 0;

    for (const h of acc.holdingsMap.values()) {
      const price = findPrice(prices, h.ticker, targetDate);
      const usdTwd =
        h.market === 'US'
          ? (findExchangeRate(exchangeRates, targetDate) ?? 1)
          : 1;

      let marketValue: number;
      if (price !== null) {
        marketValue = h.market === 'TW' ? h.units * 1000 * price : h.units * price * usdTwd;
      } else {
        marketValue = h.costTWD;
      }

      totalMarketValue += marketValue;

      const profitTWD = marketValue - h.costTWD;
      const profitPercent = h.costTWD !== 0 ? profitTWD / h.costTWD : 0;

      holdings.push({
        ticker: h.ticker,
        name: h.name,
        market: h.market,
        units: h.units,
        costTWD: h.costTWD,
        marketValueTWD: marketValue,
        profitTWD,
        profitPercent,
      });
    }

    // Sort holdings by market value descending
    holdings.sort((a, b) => b.marketValueTWD - a.marketValueTWD);

    const uninvestedCash = acc.investedAmount - acc.totalCostTWD;
    const currentValue = totalMarketValue + uninvestedCash;
    const profit = currentValue - acc.investedAmount;
    const profitPercent = acc.investedAmount !== 0 ? profit / acc.investedAmount : 0;

    result.push({
      sourceName,
      investedAmount: acc.investedAmount,
      totalCostTWD: acc.totalCostTWD,
      uninvestedCash,
      currentValue,
      profit,
      profitPercent,
      holdings,
    });
  }

  // Sort by currentValue descending
  result.sort((a, b) => b.currentValue - a.currentValue);

  return result;
}
