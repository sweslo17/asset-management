/**
 * 日期工具（皆以 YYYY-MM-DD、UTC 計算）與資料新鮮度判斷。
 */

/**
 * 價格/匯率最新日距今超過幾天視為過期。
 * 4 天可涵蓋「週五收盤 → 週一還沒更新」再加一天國定假日，超過就代表自動更新真的斷了。
 * 前端 frontend/src/utils/dateUtils.ts 的 STALE_AFTER_DAYS 應保持一致。
 */
export const STALE_AFTER_DAYS = 4;

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function subtractDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 兩個日期相差的天數（to − from）。 */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** 任一日期缺值或超過 STALE_AFTER_DAYS 即視為過期。 */
export function isStale(asOfDates: Array<string | null>, today = todayUtc()): boolean {
  return asOfDates.some((d) => d === null || daysBetween(d.slice(0, 10), today) > STALE_AFTER_DAYS);
}
