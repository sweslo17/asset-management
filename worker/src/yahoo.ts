/**
 * Yahoo Finance Chart API client for fetching historical prices and exchange rates.
 *
 * Uses the same underlying API as yfinance (v8/finance/chart).
 */

export interface YahooPriceRecord {
  ticker: string;
  date: string; // YYYY-MM-DD
  close: number;
}

export interface YahooRateRecord {
  date: string; // YYYY-MM-DD
  usd_twd: number;
}

/** Yahoo Finance Chart API response shape (partial). */
interface YahooChartResponse {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          close: Array<number | null>;
        }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

/**
 * Converts a YYYY-MM-DD date string to a Unix timestamp (seconds).
 */
function dateToUnix(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}

/**
 * Converts a Unix timestamp (seconds) to a YYYY-MM-DD date string.
 *
 * Yahoo Finance returns timestamps at midnight in the exchange's local
 * timezone (e.g. +08:00 for TW tickers), not UTC. Adding a 12-hour offset
 * before converting to UTC ensures the calendar date is always correct
 * regardless of timezone — the same approach used by yfinance.
 */
function unixToDate(ts: number): string {
  const HALF_DAY = 43200; // 12 hours in seconds
  const d = new Date((ts + HALF_DAY) * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fetches raw chart data from Yahoo Finance for a given ticker and date range.
 */
async function fetchChart(
  ticker: string,
  startDate: string,
): Promise<Array<{ date: string; close: number }>> {
  const period1 = dateToUnix(startDate);
  const period2 = Math.floor(Date.now() / 1000);

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?period1=${period1}&period2=${period2}&interval=1d`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance API error for ${ticker}: HTTP ${res.status}`);
  }

  const data: YahooChartResponse = await res.json();

  const result = data.chart.result;
  if (!result || result.length === 0) {
    return [];
  }

  const entry = result[0]!;
  const timestamps = entry.timestamp ?? [];
  const closes = entry.indicators.quote[0]?.close ?? [];

  const records: Array<{ date: string; close: number }> = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const close = closes[i];
    if (ts !== undefined && close !== null && close !== undefined) {
      records.push({ date: unixToDate(ts), close });
    }
  }

  return records;
}

/**
 * Fetches historical closing prices for a ticker from Yahoo Finance.
 *
 * @param ticker    - The Yahoo Finance ticker symbol (e.g. "AAPL", "2330.TW").
 * @param startDate - Start date in YYYY-MM-DD format.
 * @returns Array of price records from startDate to today.
 */
export async function fetchYahooPrices(
  ticker: string,
  startDate: string,
): Promise<YahooPriceRecord[]> {
  const records = await fetchChart(ticker, startDate);
  return records.map((r) => ({ ticker, date: r.date, close: r.close }));
}

/**
 * Fetches historical USD/TWD exchange rates from Yahoo Finance.
 *
 * @param startDate - Start date in YYYY-MM-DD format.
 * @returns Array of rate records from startDate to today.
 */
export async function fetchYahooRates(
  startDate: string,
): Promise<YahooRateRecord[]> {
  const records = await fetchChart('USDTWD=X', startDate);
  return records.map((r) => ({ date: r.date, usd_twd: r.close }));
}
