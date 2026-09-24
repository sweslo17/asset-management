import type { PriceRecord, ExchangeRate, Investment } from '@/api/types';

/**
 * 價格/匯率最新日距今超過幾天視為過期（涵蓋週末 + 一天假日）。
 * 與 worker/src/dates.ts 的 STALE_AFTER_DAYS 保持一致。
 */
export const STALE_AFTER_DAYS = 4;

export interface DataFreshness {
  /** 持有中各標的最新價格日的最小值（最落後的那一檔） */
  pricesAsOf: string | null;
  ratesAsOf: string | null;
  /** 較舊的那個日期距今天數；任一缺值為 null */
  lagDays: number | null;
  stale: boolean;
}

/** 兩個 YYYY-MM-DD 相差的天數（to − from） */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** 計算資料新鮮度，邏輯與 worker getDataFreshness + isStale 相同。 */
export function getDataFreshness(
  investments: Investment[],
  prices: PriceRecord[],
  rates: ExchangeRate[],
  asOf: string = today(),
): DataFreshness {
  const unitsByTicker = new Map<string, number>();
  for (const inv of investments) {
    unitsByTicker.set(inv.ticker, (unitsByTicker.get(inv.ticker) ?? 0) + inv.units);
  }
  const latestByTicker = new Map<string, string>();
  for (const p of prices) {
    if (Math.abs(unitsByTicker.get(p.ticker) ?? 0) <= 1e-9) continue;
    const cur = latestByTicker.get(p.ticker);
    if (!cur || p.date > cur) latestByTicker.set(p.ticker, p.date);
  }
  const minOf = (dates: Iterable<string>) => {
    let min: string | null = null;
    for (const d of dates) if (min === null || d < min) min = d;
    return min;
  };
  const pricesAsOf = minOf(latestByTicker.values());
  const ratesAsOf = rates.length ? getLatestDate(rates) : null;
  const oldest = pricesAsOf && ratesAsOf ? minOf([pricesAsOf, ratesAsOf]) : null;
  const lagDays = oldest ? daysBetween(oldest.slice(0, 10), asOf) : null;
  return { pricesAsOf, ratesAsOf, lagDays, stale: lagDays === null || lagDays > STALE_AFTER_DAYS };
}

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

/** Get the latest date string from dated records (prices / rates) */
export function getLatestDate(records: Array<{ date: string }>): string {
  if (records.length === 0) return new Date().toISOString().slice(0, 10);
  return records.reduce((max, p) => (p.date > max ? p.date : max), records[0].date);
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
