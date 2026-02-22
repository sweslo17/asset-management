import type { Investment } from '@/api/types';

/** Calculate cost of an investment in TWD */
export function investmentCostTWD(inv: Investment): number {
  if (inv.market === 'TW') {
    return inv.units * 1000 * inv.price_per_unit + inv.fees;
  }
  // US market
  return inv.units * inv.price_per_unit * inv.exchange_rate + inv.fees;
}

/** Calculate current market value of an investment in TWD */
export function investmentMarketValueTWD(
  inv: Investment,
  currentPrice: number,
  currentUsdTwd: number,
): number {
  if (inv.market === 'TW') {
    return inv.units * 1000 * currentPrice;
  }
  return inv.units * currentPrice * currentUsdTwd;
}

/** Format number as TWD currency string */
export function formatTWD(value: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format number as percentage */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
