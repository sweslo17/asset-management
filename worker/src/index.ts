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
 *   POST   /api/backfill?mode=          → 更新價格/匯率（recent|fill|rebuild，見 BackfillMode）；
 *                                          X-API-Key 或 X-Cron-Token（僅此路由）皆可
 *   GET    /api/quote                   → Closing price (and USD/TWD for US) on a given date
 */

import {
  getPortfolio,
  createBatch,
  createRebalance,
  getInvestment,
  updateInvestment,
  deleteInvestment,
  getBatch,
  updateBatch,
  deleteBatch,
  upsertTickerTags,
  upsertMetadata,
  deleteDimension,
  renameDimension,
  getEarliestDatesByTicker,
  getExistingPriceKeys,
  getExistingRateDates,
  writeMarketData,
  getDataFreshness,
  getSleeveSummary,
} from './d1';
import { isStale, subtractDays, todayUtc } from './dates';
import type {
  BackfillMode,
  BackfillResponse,
  Batch,
  CreateBatchRequest,
  Env,
  Investment,
  QuoteResponse,
  RebalanceRequest,
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

function corsHeaders(origin = '*'): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

/** 取得字串的 hostname（容許帶或不帶 scheme），失敗則原樣回傳。 */
function hostOf(s: string): string {
  try {
    return new URL(s.includes('://') ? s : `https://${s}`).host;
  } catch {
    return s;
  }
}

/**
 * 解析這次請求該回的 Access-Control-Allow-Origin（永遠是合法值）。
 * - 未設 ALLOWED_ORIGINS，或非瀏覽器請求（無 Origin header，如 curl/web_fetch）→ '*'
 * - 請求 Origin 的 host 在白名單 → 回請求的完整 Origin（含 scheme，必合法）
 * - 不在白名單 → 回第一個白名單項正規化成 https://host（合法但不匹配，瀏覽器擋下=預期）
 * 容錯：白名單項可帶或不帶 https://（用 host 比對）。
 */
function resolveOrigin(env: Env, request: Request): string {
  const allow = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allow.length === 0) return '*';
  const origin = request.headers.get('Origin');
  if (!origin) return '*';
  const allowHosts = allow.map(hostOf);
  if (allowHosts.includes(hostOf(origin))) return origin;
  return `https://${allowHosts[0]}`;
}

/** 在回應上覆寫 Access-Control-Allow-Origin（集中處理 CORS）。 */
function withCors(resp: Response, origin: string): Response {
  const r = new Response(resp.body, resp);
  r.headers.set('Access-Control-Allow-Origin', origin);
  r.headers.set('Vary', 'Origin');
  return r;
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
  const [summary, freshness] = await Promise.all([getSleeveSummary(env.DB), getDataFreshness(env.DB)]);
  // 讓 investment-judgement 能判斷資料是否過期（as_of 只是最新匯率日）。
  return jsonResponse({
    ...summary,
    prices_as_of: freshness.prices_as_of,
    stale: isStale([freshness.prices_as_of, freshness.rates_as_of]),
  });
}

async function handleCreateBatch(request: Request, env: Env): Promise<Response> {
  const body: CreateBatchRequest = await request.json();
  if (!body.batch || !body.funding_sources || !body.investments) {
    return errorResponse('Request body must include batch, funding_sources, and investments.', 400);
  }
  const result = await createBatch(env.DB, body.batch, body.funding_sources, body.investments);
  return jsonResponse(result, 201);
}

async function handleRebalance(request: Request, env: Env): Promise<Response> {
  const body: RebalanceRequest = await request.json();
  if (!body.date || !body.trades || !Array.isArray(body.trades) || body.trades.length === 0) {
    return errorResponse('Request body must include date and a non-empty trades array.', 400);
  }
  const result = await createRebalance(env.DB, body.date, body.description ?? '', body.trades);
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

async function handleUpsertMetadata(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { key?: string; value?: string };
  if (!body.key) return errorResponse('Request body must include key.', 400);
  await upsertMetadata(env.DB, body.key, String(body.value ?? ''));
  return jsonResponse({ key: body.key, value: body.value });
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

/** recent 模式抓取的天數（涵蓋農曆年等長假，窗口內至少有交易日才能判斷「無資料」是異常）。 */
const RECENT_DAYS = 14;
/** 全史模式往最早投資日之前多抓的天數：投資日落在週末/假日時，仍查得到「當日或之前」的價格。 */
const LOOKBACK_PAD_DAYS = 7;

/** 依 key 去重（同 key 保留最後一筆＝最新值），並排除 skip 中已存在的 key。 */
function dedupeRecords<T>(records: T[], keyOf: (r: T) => string, skip?: Set<string>): T[] {
  const byKey = new Map<string, T>();
  for (const r of records) {
    const k = keyOf(r);
    if (!skip?.has(k)) byKey.set(k, r);
  }
  return Array.from(byKey.values());
}

/** 共用的 backfill 核心，模式說明見 BackfillMode。 */
async function runBackfill(env: Env, mode: BackfillMode): Promise<BackfillResponse> {
  const tickerEarliestDate = await getEarliestDatesByTicker(env.DB);
  const errors: string[] = [];
  let pricesWritten = 0;
  let ratesWritten = 0;

  if (tickerEarliestDate.size > 0) {
    const recentSince = mode === 'recent' ? subtractDays(todayUtc(), RECENT_DAYS) : null;
    const startDateFor = (earliest: string): string => {
      const padded = subtractDays(earliest, LOOKBACK_PAD_DAYS);
      return recentSince && recentSince > padded ? recentSince : padded;
    };
    // 抓取失敗或回傳空資料都記進 errors（Yahoo 擋 IP 時常是空結果而非 HTTP 錯誤）。
    const fetchOrRecord = async <T>(label: string, p: Promise<T[]>): Promise<T[]> => {
      try {
        const recs = await p;
        if (recs.length === 0) errors.push(`${label}: no data`);
        return recs;
      } catch (err) {
        errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    };

    const earliestOverall = Array.from(tickerEarliestDate.values()).reduce((a, b) => (a < b ? a : b));
    const [priceResults, rateRecords] = await Promise.all([
      Promise.all(Array.from(tickerEarliestDate, ([ticker, earliest]) =>
        fetchOrRecord(ticker, fetchYahooPrices(ticker, startDateFor(earliest))))),
      fetchOrRecord('USDTWD=X', fetchYahooRates(startDateFor(earliestOverall))),
    ]);

    // fill 只補缺；recent 覆寫窗口；rebuild 全部重寫。
    const [skipPrices, skipRates] = mode === 'fill'
      ? await Promise.all([getExistingPriceKeys(env.DB), getExistingRateDates(env.DB)])
      : [undefined, undefined];
    const prices = dedupeRecords(priceResults.flat(), (r) => `${r.ticker}|${r.date}`, skipPrices);
    const rates = dedupeRecords(rateRecords, (r) => r.date, skipRates);

    if (mode === 'rebuild' && errors.length > 0) {
      console.error(`[Backfill] rebuild aborted, data untouched: ${errors.join('; ')}`);
    } else {
      await writeMarketData(env.DB, prices, rates, { replaceAll: mode === 'rebuild' });
      pricesWritten = prices.length;
      ratesWritten = rates.length;
    }
    if (errors.length === 0) await upsertMetadata(env.DB, 'last_update', new Date().toISOString());
  }

  const freshness = await getDataFreshness(env.DB);
  const result: BackfillResponse = {
    mode,
    prices_added: pricesWritten,
    rates_added: ratesWritten,
    errors,
    ...freshness,
    stale: isStale([freshness.prices_as_of, freshness.rates_as_of]),
  };
  const summary = `[Backfill] mode=${mode} prices=${pricesWritten} rates=${ratesWritten} ` +
    `prices_as_of=${result.prices_as_of} rates_as_of=${result.rates_as_of} stale=${result.stale}`;
  if (errors.length > 0 || result.stale) console.error(`${summary} errors=${JSON.stringify(errors)}`);
  else console.log(summary);
  return result;
}

const BACKFILL_MODES: readonly BackfillMode[] = ['recent', 'fill', 'rebuild'];

async function handleBackfill(modeParam: string, env: Env): Promise<Response> {
  const mode = (modeParam || 'fill') as BackfillMode;
  if (!BACKFILL_MODES.includes(mode)) {
    return errorResponse(`Invalid mode "${modeParam}"; expected one of ${BACKFILL_MODES.join(', ')}`, 400);
  }
  return jsonResponse(await runBackfill(env, mode));
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
  | { route: 'rebalance' }
  | { route: 'upsert_metadata' }
  | { route: 'update_investment'; id: string }
  | { route: 'delete_investment'; id: string }
  | { route: 'update_batch'; id: string }
  | { route: 'delete_batch'; id: string }
  | { route: 'upsert_ticker_tags' }
  | { route: 'delete_dimension'; name: string }
  | { route: 'rename_dimension'; name: string }
  | { route: 'backfill'; mode: string }
  | { route: 'quote'; ticker: string; date: string; market: string }
  | null;

function matchRoute(method: string, pathname: string): Route {
  if (method === 'GET' && pathname === '/api/portfolio') return { route: 'get_portfolio' };
  if (method === 'GET' && pathname === '/api/sleeve-summary') return { route: 'sleeve_summary' };
  if (method === 'GET' && pathname === '/api/search-ticker') return { route: 'search_ticker', query: '' };
  if (method === 'GET' && pathname === '/api/quote') return { route: 'quote', ticker: '', date: '', market: '' };
  if (method === 'POST' && pathname === '/api/batches') return { route: 'create_batch' };
  if (method === 'POST' && pathname === '/api/rebalance') return { route: 'rebalance' };
  if (method === 'POST' && pathname === '/api/metadata') return { route: 'upsert_metadata' };
  if (method === 'PUT' && pathname === '/api/ticker-tags') return { route: 'upsert_ticker_tags' };
  if (method === 'POST' && pathname === '/api/backfill') return { route: 'backfill', mode: '' };

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

async function handleRequest(request: Request, env: Env): Promise<Response> {
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

  // 其餘路由：X-API-Key（人/前端）。
  // 例外：POST /api/backfill 也接受 X-Cron-Token（GitHub Actions 備援排程，權限只到更新價格）。
  const apiKey = request.headers.get('X-API-Key');
  const cronToken = request.headers.get('X-Cron-Token');
  const isCronBackfill = method === 'POST' && pathname === '/api/backfill'
    && !!env.CRON_TOKEN && cronToken === env.CRON_TOKEN;
  if (!isCronBackfill && (!apiKey || apiKey !== env.API_KEY)) {
    return errorResponse('Unauthorized: invalid or missing API key.', 401);
  }

  const matched = matchRoute(method, pathname);
  if (matched === null) return errorResponse(`Route not found: ${method} ${pathname}`, 404);

  if (matched.route === 'search_ticker') matched.query = url.searchParams.get('q') ?? '';
  if (matched.route === 'backfill') matched.mode = url.searchParams.get('mode') ?? '';
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
      case 'rebalance': return await handleRebalance(request, env);
      case 'upsert_metadata': return await handleUpsertMetadata(request, env);
      case 'update_investment': return await handleUpdateInvestment(matched.id, request, env);
      case 'delete_investment': return await handleDeleteInvestment(matched.id, env);
      case 'update_batch': return await handleUpdateBatch(matched.id, request, env);
      case 'delete_batch': return await handleDeleteBatch(matched.id, env);
      case 'upsert_ticker_tags': return await handleUpsertTickerTags(request, env);
      case 'delete_dimension': return await handleDeleteDimension(matched.name, env);
      case 'rename_dimension': return await handleRenameDimension(matched.name, request, env);
      case 'backfill': return await handleBackfill(matched.mode, env);
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
}

// ---------------------------------------------------------------------------
// Worker entry
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = resolveOrigin(env, request);
    return withCors(await handleRequest(request, env), origin);
  },

  /**
   * Cron 排程：每日更新價格與匯率（recent 模式）。排程設定見 wrangler.toml [triggers]；
   * GitHub Actions（.github/workflows/update-prices.yml）另有備援排程打 /api/backfill?mode=recent。
   * 更新不完整或資料過期時丟出錯誤，讓這次排程在 Cloudflare 觀測中標記為失敗。
   */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const r = await runBackfill(env, 'recent');
        if (r.errors.length > 0 || r.stale) {
          throw new Error(`[Cron] incomplete update: errors=${JSON.stringify(r.errors)} stale=${r.stale}`);
        }
      })(),
    );
  },
};
