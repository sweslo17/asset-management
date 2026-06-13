/**
 * Cloudflare Worker entry point for the Asset Management API.
 * 後端為 Cloudflare D1（見 d1.ts / schema.sql）。
 *
 * Route table:
 *   GET    /api/portfolio               → Full portfolio snapshot
 *   GET    /api/sleeve-summary?token=   → 唯讀 sleeve + 總淨值摘要（investment-judgement 用，走 token）
 *   POST   /api/batches                 → Create batch + funding sources + investments
 *   PUT    /api/investments/:id         → Update a single investment
 *   DELETE /api/investments/:id         → Delete a single investment
 *   PUT    /api/batches/:id             → Update a single batch
 *   DELETE /api/batches/:id             → Delete batch + all related data
 *   PUT    /api/ticker-tags             → Batch upsert ticker tag assignments
 *   DELETE /api/dimensions/:name        → Delete all tags in a dimension
 *   PUT    /api/dimensions/:name/rename → Rename a dimension
 *   POST   /api/backfill                → Backfill historical prices & rates
 *   GET    /api/quote                   → Closing price (and USD/TWD for US) on a given date
 */

import {
  getPortfolio,
  createBatch,
  getInvestment,
  updateInvestment,
  deleteInvestment,
  getBatch,
  updateBatch,
  deleteBatch,
  upsertTickerTags,
  deleteDimension,
  renameDimension,
  getEarliestDatesByTicker,
  getExistingPriceKeys,
  getExistingRateDates,
  upsertPrices,
  upsertRates,
  getSleeveSummary,
} from './d1';
import type {
  BackfillResponse,
  Batch,
  CreateBatchRequest,
  Env,
  Investment,
  QuoteResponse,
  RenameDimensionRequest,
  TickerTag,
  UpdateBatchRequest,
  UpdateInvestmentRequest,
  UpsertTickerTagsRequest,
} from './types';
import { fetchYahooPrices, fetchYahooRates } from './yahoo';

// ---------------------------------------------------------------------------
// CORS / responses
// ---------------------------------------------------------------------------

const ALLOWED_ORIGIN = '*';

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleGetPortfolio(env: Env): Promise<Response> {
  return jsonResponse(await getPortfolio(env.DB));
}

async function handleSleeveSummary(env: Env): Promise<Response> {
  return jsonResponse(await getSleeveSummary(env.DB));
}

async function handleCreateBatch(request: Request, env: Env): Promise<Response> {
  const body: CreateBatchRequest = await request.json();
  if (!body.batch || !body.funding_sources || !body.investments) {
    return errorResponse('Request body must include batch, funding_sources, and investments.', 400);
  }
  const result = await createBatch(env.DB, body.batch, body.funding_sources, body.investments);
  return jsonResponse(result, 201);
}

async function handleUpdateInvestment(id: string, request: Request, env: Env): Promise<Response> {
  const body: UpdateInvestmentRequest = await request.json();
  const current = await getInvestment(env.DB, id);
  if (!current) return errorResponse(`Investment "${id}" not found.`, 404);

  const merged: Investment = {
    id: current.id,
    batch_id: body.batch_id ?? current.batch_id,
    ticker: body.ticker ?? current.ticker,
    name: body.name ?? current.name,
    market: (body.market ?? current.market) as 'TW' | 'US',
    date: body.date ?? current.date,
    units: body.units ?? current.units,
    price_per_unit: body.price_per_unit ?? current.price_per_unit,
    exchange_rate: body.exchange_rate ?? current.exchange_rate,
    fees: body.fees ?? current.fees,
    tags: body.tags ?? current.tags,
  };
  await updateInvestment(env.DB, merged);
  return jsonResponse(merged);
}

async function handleDeleteInvestment(id: string, env: Env): Promise<Response> {
  const current = await getInvestment(env.DB, id);
  if (!current) return errorResponse(`Investment "${id}" not found.`, 404);
  await deleteInvestment(env.DB, id);
  return jsonResponse({ deleted: id });
}

async function handleUpdateBatch(id: string, request: Request, env: Env): Promise<Response> {
  const body: UpdateBatchRequest = await request.json();
  const current = await getBatch(env.DB, id);
  if (!current) return errorResponse(`Batch "${id}" not found.`, 404);
  const merged: Batch = {
    batch_id: current.batch_id,
    date: body.date ?? current.date,
    description: body.description ?? current.description,
  };
  await updateBatch(env.DB, merged);
  return jsonResponse(merged);
}

async function handleDeleteBatch(id: string, env: Env): Promise<Response> {
  const current = await getBatch(env.DB, id);
  if (!current) return errorResponse(`Batch "${id}" not found.`, 404);
  const counts = await deleteBatch(env.DB, id);
  return jsonResponse({
    deleted: {
      batch_id: id,
      investments_deleted: counts.investments,
      funding_sources_deleted: counts.funding,
    },
  });
}

async function handleUpsertTickerTags(request: Request, env: Env): Promise<Response> {
  const body: UpsertTickerTagsRequest = await request.json();
  if (!body.assignments || !Array.isArray(body.assignments)) {
    return errorResponse('Request body must include assignments array.', 400);
  }
  await upsertTickerTags(env.DB, body.assignments as TickerTag[]);
  return jsonResponse({ updated: body.assignments.length });
}

async function handleDeleteDimension(name: string, env: Env): Promise<Response> {
  const n = await deleteDimension(env.DB, name);
  return jsonResponse({ deleted_dimension: name, rows_deleted: n });
}

async function handleRenameDimension(name: string, request: Request, env: Env): Promise<Response> {
  const body: RenameDimensionRequest = await request.json();
  if (!body.new_name) return errorResponse('Request body must include new_name.', 400);
  const renamed = await renameDimension(env.DB, name, body.new_name);
  return jsonResponse({ renamed });
}

async function handleSearchTicker(query: string): Promise<Response> {
  if (!query || query.length < 1) return jsonResponse([]);
  const yahooUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false`;
  const res = await fetch(yahooUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return jsonResponse([]);
  const data = (await res.json()) as {
    quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; quoteType?: string; exchDisp?: string }>;
  };
  const quotes = (data.quotes ?? [])
    .filter((q) => {
      if (!q.symbol || (q.quoteType !== 'EQUITY' && q.quoteType !== 'ETF')) return false;
      const s = q.symbol;
      return /\.TW[O]?$/.test(s) || !s.includes('.');
    })
    .map((q) => {
      const symbol = q.symbol ?? '';
      const market: 'TW' | 'US' = /\.TW[O]?$/.test(symbol) ? 'TW' : 'US';
      return { ticker: symbol, name: q.shortname ?? q.longname ?? '', market, exchange: q.exchDisp ?? '' };
    });
  return jsonResponse(quotes);
}

/**
 * 共用的 backfill 核心。
 * @param recentDays 若提供，採增量模式：每個 ticker 只抓「今天往前 recentDays 天」；
 *                   否則採完整模式：從每個 ticker 最早投資日抓全史。
 */
async function runBackfill(env: Env, recentDays?: number): Promise<BackfillResponse> {
  const tickerEarliestDate = await getEarliestDatesByTicker(env.DB);
  if (tickerEarliestDate.size === 0) {
    return { prices_added: 0, rates_added: 0 };
  }
  const [existingPriceKeys, existingRateDates] = await Promise.all([
    getExistingPriceKeys(env.DB),
    getExistingRateDates(env.DB),
  ]);

  // 增量模式：起算日改為 today - recentDays（但不早於該 ticker 最早投資日）。
  const tickerEntries: Array<[string, string]> = Array.from(tickerEarliestDate.entries());
  if (recentDays !== undefined) {
    const since = subtractDays(new Date().toISOString().slice(0, 10), recentDays);
    for (const e of tickerEntries) {
      if (since > e[1]) e[1] = since;
    }
  }
  const priceResults = await Promise.all(
    tickerEntries.map(([ticker, startDate]) =>
      fetchYahooPrices(ticker, startDate).catch((err) => {
        console.error(`[Backfill] prices ${ticker}: ${err}`);
        return [];
      }),
    ),
  );
  let rateStartDate = Array.from(tickerEarliestDate.values()).reduce((a, b) => (a < b ? a : b));
  if (recentDays !== undefined) {
    const since = subtractDays(new Date().toISOString().slice(0, 10), recentDays);
    if (since > rateStartDate) rateStartDate = since;
  }
  const rateResults = await fetchYahooRates(rateStartDate).catch((err) => {
    console.error(`[Backfill] rates: ${err}`);
    return [];
  });

  const newPrices = [];
  for (const records of priceResults) {
    for (const rec of records) {
      const key = `${rec.ticker}|${rec.date}`;
      if (!existingPriceKeys.has(key)) {
        newPrices.push(rec);
        existingPriceKeys.add(key);
      }
    }
  }
  const newRates = [];
  for (const rec of rateResults) {
    if (!existingRateDates.has(rec.date)) {
      newRates.push(rec);
      existingRateDates.add(rec.date);
    }
  }
  await upsertPrices(env.DB, newPrices);
  await upsertRates(env.DB, newRates);
  return { prices_added: newPrices.length, rates_added: newRates.length };
}

async function handleBackfill(env: Env): Promise<Response> {
  return jsonResponse(await runBackfill(env));
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function handleQuote(ticker: string, date: string, market: string): Promise<Response> {
  if (!ticker) return errorResponse('Missing required query parameter: ticker', 400);
  if (!date) return errorResponse('Missing required query parameter: date', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorResponse('Invalid date format; expected YYYY-MM-DD', 400);

  const startDate = subtractDays(date, 7);
  const priceRecords = await fetchYahooPrices(ticker, startDate).catch((err) => {
    console.error(`[Quote] prices ${ticker}: ${err}`);
    return [];
  });
  const matchingPrice = priceRecords.filter((r) => r.date <= date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!matchingPrice) return errorResponse(`No price data available for ${ticker} on or before ${date}`, 404);

  const isUS = market === 'US' || (!market && !/\.TW[O]?$/.test(ticker));
  let usdTwd: number | null = null;
  if (isUS) {
    const rateRecords = await fetchYahooRates(startDate).catch((err) => {
      console.error(`[Quote] rates: ${err}`);
      return [];
    });
    const matchingRate = rateRecords.filter((r) => r.date <= date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    usdTwd = matchingRate ? matchingRate.usd_twd : null;
  }
  const result: QuoteResponse = { ticker, date: matchingPrice.date, close: matchingPrice.close, usd_twd: usdTwd };
  return jsonResponse(result);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

type Route =
  | { route: 'get_portfolio' }
  | { route: 'sleeve_summary' }
  | { route: 'search_ticker'; query: string }
  | { route: 'create_batch' }
  | { route: 'update_investment'; id: string }
  | { route: 'delete_investment'; id: string }
  | { route: 'update_batch'; id: string }
  | { route: 'delete_batch'; id: string }
  | { route: 'upsert_ticker_tags' }
  | { route: 'delete_dimension'; name: string }
  | { route: 'rename_dimension'; name: string }
  | { route: 'backfill' }
  | { route: 'quote'; ticker: string; date: string; market: string }
  | null;

function matchRoute(method: string, pathname: string): Route {
  if (method === 'GET' && pathname === '/api/portfolio') return { route: 'get_portfolio' };
  if (method === 'GET' && pathname === '/api/sleeve-summary') return { route: 'sleeve_summary' };
  if (method === 'GET' && pathname === '/api/search-ticker') return { route: 'search_ticker', query: '' };
  if (method === 'GET' && pathname === '/api/quote') return { route: 'quote', ticker: '', date: '', market: '' };
  if (method === 'POST' && pathname === '/api/batches') return { route: 'create_batch' };
  if (method === 'PUT' && pathname === '/api/ticker-tags') return { route: 'upsert_ticker_tags' };
  if (method === 'POST' && pathname === '/api/backfill') return { route: 'backfill' };

  const investmentMatch = pathname.match(/^\/api\/investments\/([^/]+)$/);
  if (investmentMatch && investmentMatch[1] !== undefined) {
    if (method === 'PUT') return { route: 'update_investment', id: investmentMatch[1] };
    if (method === 'DELETE') return { route: 'delete_investment', id: investmentMatch[1] };
  }
  const batchMatch = pathname.match(/^\/api\/batches\/([^/]+)$/);
  if (batchMatch && batchMatch[1] !== undefined) {
    if (method === 'PUT') return { route: 'update_batch', id: batchMatch[1] };
    if (method === 'DELETE') return { route: 'delete_batch', id: batchMatch[1] };
  }
  const dimRenameMatch = pathname.match(/^\/api\/dimensions\/([^/]+)\/rename$/);
  if (dimRenameMatch && method === 'PUT') return { route: 'rename_dimension', name: decodeURIComponent(dimRenameMatch[1] ?? '') };
  const dimMatch = pathname.match(/^\/api\/dimensions\/([^/]+)$/);
  if (dimMatch && method === 'DELETE') return { route: 'delete_dimension', name: decodeURIComponent(dimMatch[1] ?? '') };
  return null;
}

// ---------------------------------------------------------------------------
// Worker fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { method } = request;
    const pathname = url.pathname;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // sleeve-summary 走唯讀 token（query 參數），不需要 X-API-Key——
    // 因為 investment-judgement 排程的 web_fetch 無法帶自訂 header。
    if (method === 'GET' && pathname === '/api/sleeve-summary') {
      const token = url.searchParams.get('token');
      if (!token || token !== env.READ_TOKEN) {
        return errorResponse('Unauthorized: invalid or missing read token.', 401);
      }
      try {
        return await handleSleeveSummary(env);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : 'Unexpected error.', 500);
      }
    }

    // 其餘路由：X-API-Key（人/前端）。前端另由 Cloudflare Access 在邊緣把關。
    const apiKey = request.headers.get('X-API-Key');
    if (!apiKey || apiKey !== env.API_KEY) {
      return errorResponse('Unauthorized: invalid or missing API key.', 401);
    }

    const matched = matchRoute(method, pathname);
    if (matched === null) return errorResponse(`Route not found: ${method} ${pathname}`, 404);

    if (matched.route === 'search_ticker') matched.query = url.searchParams.get('q') ?? '';
    if (matched.route === 'quote') {
      matched.ticker = url.searchParams.get('ticker') ?? '';
      matched.date = url.searchParams.get('date') ?? '';
      matched.market = url.searchParams.get('market') ?? '';
    }

    try {
      switch (matched.route) {
        case 'get_portfolio': return await handleGetPortfolio(env);
        case 'sleeve_summary': return await handleSleeveSummary(env);
        case 'search_ticker': return await handleSearchTicker(matched.query);
        case 'create_batch': return await handleCreateBatch(request, env);
        case 'update_investment': return await handleUpdateInvestment(matched.id, request, env);
        case 'delete_investment': return await handleDeleteInvestment(matched.id, env);
        case 'update_batch': return await handleUpdateBatch(matched.id, request, env);
        case 'delete_batch': return await handleDeleteBatch(matched.id, env);
        case 'upsert_ticker_tags': return await handleUpsertTickerTags(request, env);
        case 'delete_dimension': return await handleDeleteDimension(matched.name, env);
        case 'rename_dimension': return await handleRenameDimension(matched.name, request, env);
        case 'backfill': return await handleBackfill(env);
        case 'quote': return await handleQuote(matched.ticker, matched.date, matched.market);
        default: {
          const _exhaustive: never = matched;
          void _exhaustive;
          return errorResponse('Unhandled route.', 500);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      return errorResponse(message, 500);
    }
  },

  /**
   * Cron 排程：每日更新價格與匯率（增量，近 7 天）。
   * 取代原本的 GitHub Actions + Python 腳本。
   * 排程設定見 wrangler.toml [triggers]。
   */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const r = await runBackfill(env, 7);
          console.log(`[Cron] prices +${r.prices_added}, rates +${r.rates_added}`);
        } catch (err) {
          console.error(`[Cron] backfill failed: ${err instanceof Error ? err.message : err}`);
        }
      })(),
    );
  },
};
