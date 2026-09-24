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
      meta: {
        /** 交易所相對 UTC 的秒數偏移（含夏令時間），如 America/New_York 夏季為 -14400。 */
        gmtoffset: number;
      };
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
 * Converts a Unix timestamp (seconds) to the exchange-local YYYY-MM-DD date.
 *
 * Yahoo 日 K 的 timestamp 是「該交易日開盤時間」（美股 13:30 UTC、台股 01:00 UTC、
 * 外匯 23:00 UTC 前一天），盤中最後一根則是最新成交時間，都不是 UTC 午夜。
 * 以交易所的 gmtoffset 換成當地時間再取日期，才能得到正確的交易日
 * （舊做法固定 +12h 會讓美股整體晚一天）。
 */
function unixToLocalDate(ts: number, gmtoffset: number): string {
  const d = new Date((ts + gmtoffset) * 1000);
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
  const gmtoffset = entry.meta?.gmtoffset ?? 0;
  const timestamps = entry.timestamp ?? [];
  const closes = entry.indicators.quote[0]?.close ?? [];

  const records: Array<{ date: string; close: number }> = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const close = closes[i];
    if (ts !== undefined && close !== null && close !== undefined) {
      records.push({ date: unixToLocalDate(ts, gmtoffset), close });
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
