import type { PriceRecord, ExchangeRate } from '@/api/types';

/** Find the closest price for a ticker on or before a given date */
export function findPrice(
  prices: PriceRecord[],
  ticker: string,
  date: string,
): number | null {
  const tickerPrices = prices
    .filter((p) => p.ticker === ticker && p.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date));
  return tickerPrices.length > 0 ? tickerPrices[0].close : null;
}

/** Find the closest USD/TWD exchange rate on or before a given date */
export function findExchangeRate(
  rates: ExchangeRate[],
  date: string,
): number | null {
  const sorted = rates
    .filter((r) => r.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date));
  return sorted.length > 0 ? sorted[0].usd_twd : null;
}

/** Get the latest date string from prices */
export function getLatestDate(prices: PriceRecord[]): string {
  if (prices.length === 0) return new Date().toISOString().slice(0, 10);
  return prices.reduce((max, p) => (p.date > max ? p.date : max), prices[0].date);
}

/** Get today's date as YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parse tags string into array */
export function parseTags(tags: string): string[] {
  return tags.split(',').map((t) => t.trim()).filter(Boolean);
}

/** Get all unique tags from investments */
export function getAllTags(investments: { tags: string }[]): string[] {
  const tagSet = new Set<string>();
  for (const inv of investments) {
    for (const tag of parseTags(inv.tags)) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort();
}
