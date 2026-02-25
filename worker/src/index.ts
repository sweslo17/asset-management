/**
 * Cloudflare Worker entry point for the Asset Management API.
 *
 * Route table:
 *   GET    /api/portfolio               → Full portfolio snapshot
 *   POST   /api/batches                 → Create batch + funding sources + investments
 *   PUT    /api/investments/:id         → Update a single investment row
 *   DELETE /api/investments/:id         → Delete a single investment row
 *   PUT    /api/batches/:id             → Update a single batch row
 *   DELETE /api/batches/:id             → Delete batch + all related data
 *   PUT    /api/ticker-tags             → Batch upsert ticker tag assignments
 *   DELETE /api/dimensions/:name        → Delete all tags in a dimension
 *   PUT    /api/dimensions/:name/rename → Rename a dimension
 *   POST   /api/backfill               → Backfill historical prices & rates
 */

import {
  appendRows,
  deleteRow,
  findAllRowIndices,
  findRowIndex,
  readRawRows,
  readSheet,
  updateRow,
} from './sheets';
import type {
  BackfillResponse,
  Batch,
  CreateBatchRequest,
  Env,
  FundingSource,
  Investment,
  Metadata,
  PortfolioData,
  RenameDimensionRequest,
  TickerTag,
  UpdateBatchRequest,
  UpdateInvestmentRequest,
  UpsertTickerTagsRequest,
} from './types';
import { fetchYahooPrices, fetchYahooRates } from './yahoo';

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/**
 * Allowed origin for cross-origin requests.
 * In production, replace with your actual frontend origin.
 */
const ALLOWED_ORIGIN = '*'; // e.g. "https://assets.yourdomain.com"

/**
 * Returns the standard CORS response headers.
 * The `origin` parameter allows you to echo back a specific origin if needed.
 */
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Builds a JSON response with CORS headers attached.
 */
function jsonResponse(
  data: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

/**
 * Builds a standardised JSON error response.
 */
function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

// ---------------------------------------------------------------------------
// Row field accessor
// ---------------------------------------------------------------------------

/**
 * Safely retrieves a string value from a parsed sheet row object.
 * Returns an empty string when the key is absent, which avoids the
 * `string | undefined` issue from `noUncheckedIndexedAccess` on index signatures.
 */
function field(row: Readonly<Record<string, string | undefined>>, key: string): string {
  return row[key] ?? '';
}

// ---------------------------------------------------------------------------
// ID generation helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the numeric suffix from IDs of the form "PREFIX-NNN" and returns
 * the next ID string.  Falls back to "PREFIX-001" when the sheet is empty.
 *
 * @param existingIds - All existing ID strings from the sheet.
 * @param prefix      - The ID prefix (e.g. "BATCH" or "INV").
 */
function nextId(existingIds: string[], prefix: string): string {
  const nums = existingIds
    .map((id) => {
      const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
      // match[1] is the capture group — present when match is non-null.
      if (!match || match[1] === undefined) return 0;
      return parseInt(match[1], 10);
    })
    .filter((n) => !isNaN(n) && n > 0);

  const max = nums.length > 0 ? Math.max(...nums) : 0;
  const next = max + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Column-order helpers
// ---------------------------------------------------------------------------

/**
 * Serialises a Batch object to a flat string array matching the sheet columns:
 * batch_id | date | description
 */
function batchToRow(b: Batch): string[] {
  return [b.batch_id, b.date, b.description];
}

/**
 * Serialises a FundingSource object to a flat string array:
 * batch_id | source_name | amount_twd
 */
function fundingSourceToRow(fs: FundingSource): string[] {
  return [fs.batch_id, fs.source_name, String(fs.amount_twd)];
}

/**
 * Serialises an Investment object to a flat string array:
 * id | batch_id | ticker | name | market | date | units | price_per_unit | exchange_rate | fees | tags
 */
function investmentToRow(inv: Investment): string[] {
  return [
    inv.id,
    inv.batch_id,
    inv.ticker,
    inv.name,
    inv.market,
    inv.date,
    String(inv.units),
    String(inv.price_per_unit),
    String(inv.exchange_rate),
    String(inv.fees),
    inv.tags,
  ];
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/portfolio
 *
 * Reads all six sheets in parallel and returns them as a single PortfolioData
 * JSON object.
 */
async function handleGetPortfolio(env: Env): Promise<Response> {
  const [
    batchRows,
    fundingSourceRows,
    investmentRows,
    priceRows,
    exchangeRateRows,
    metadataRows,
    tickerTagRows,
  ] = await Promise.all([
    readSheet('batches', env),
    readSheet('funding_sources', env),
    readSheet('investments', env),
    readSheet('prices', env),
    readSheet('exchange_rates', env),
    readSheet('metadata', env),
    readSheet('ticker_tags', env),
  ]);

  const portfolio: PortfolioData = {
    batches: batchRows.map((r) => ({
      batch_id: field(r, 'batch_id'),
      date: field(r, 'date'),
      description: field(r, 'description'),
    })),
    funding_sources: fundingSourceRows.map((r) => ({
      batch_id: field(r, 'batch_id'),
      source_name: field(r, 'source_name'),
      amount_twd: Number(field(r, 'amount_twd')),
    })),
    investments: investmentRows.map((r) => ({
      id: field(r, 'id'),
      batch_id: field(r, 'batch_id'),
      ticker: field(r, 'ticker'),
      name: field(r, 'name'),
      market: field(r, 'market') as 'TW' | 'US',
      date: field(r, 'date'),
      units: Number(field(r, 'units')),
      price_per_unit: Number(field(r, 'price_per_unit')),
      exchange_rate: Number(field(r, 'exchange_rate')),
      fees: Number(field(r, 'fees')),
      tags: field(r, 'tags'),
    })),
    prices: priceRows.map((r) => ({
      ticker: field(r, 'ticker'),
      date: field(r, 'date'),
      close: Number(field(r, 'close')),
    })),
    exchange_rates: exchangeRateRows.map((r) => ({
      date: field(r, 'date'),
      usd_twd: Number(field(r, 'usd_twd')),
    })),
    metadata: metadataRows.map((r): Metadata => ({
      key: field(r, 'key'),
      value: field(r, 'value'),
    })),
    ticker_tags: tickerTagRows.map((r): TickerTag => ({
      ticker: field(r, 'ticker'),
      dimension: field(r, 'dimension'),
      tag: field(r, 'tag'),
    })),
  };

  return jsonResponse(portfolio);
}

/**
 * POST /api/batches
 *
 * Creates a batch, its funding sources, and its investments atomically
 * (three sequential sheet appends).  IDs are auto-generated.
 */
async function handleCreateBatch(
  request: Request,
  env: Env,
): Promise<Response> {
  const body: CreateBatchRequest = await request.json();

  if (!body.batch || !body.funding_sources || !body.investments) {
    return errorResponse(
      'Request body must include batch, funding_sources, and investments.',
      400,
    );
  }

  // --- Resolve next batch_id ---
  const [existingBatchRows, existingInvestmentRows] = await Promise.all([
    readSheet('batches', env),
    readSheet('investments', env),
  ]);

  const existingBatchIds = existingBatchRows.map((r) => field(r, 'batch_id'));
  const existingInvIds = existingInvestmentRows.map((r) => field(r, 'id'));

  const batchId = nextId(existingBatchIds, 'BATCH');

  // --- Build objects ---
  const newBatch: Batch = {
    batch_id: batchId,
    date: body.batch.date,
    description: body.batch.description,
  };

  const newFundingSources: FundingSource[] = body.funding_sources.map((fs) => ({
    batch_id: batchId,
    source_name: fs.source_name,
    amount_twd: fs.amount_twd,
  }));

  // Pre-compute all investment IDs for this batch upfront so each
  // successive ID correctly accounts for the ones already allocated above it.
  const allocatedInvIds = [...existingInvIds];
  const newInvestmentIds: string[] = body.investments.map(() => {
    const id = nextId(allocatedInvIds, 'INV');
    allocatedInvIds.push(id);
    return id;
  });

  const newInvestments: Investment[] = body.investments.map((inv, index) => ({
    ...inv,
    id: newInvestmentIds[index] as string,
    batch_id: batchId,
  }));

  // --- Append to sheets ---
  await appendRows('batches', [batchToRow(newBatch)], env);
  if (newFundingSources.length > 0) {
    await appendRows(
      'funding_sources',
      newFundingSources.map(fundingSourceToRow),
      env,
    );
  }
  if (newInvestments.length > 0) {
    await appendRows(
      'investments',
      newInvestments.map(investmentToRow),
      env,
    );
  }

  return jsonResponse(
    {
      batch: newBatch,
      funding_sources: newFundingSources,
      investments: newInvestments,
    },
    201,
  );
}

/**
 * PUT /api/investments/:id
 *
 * Updates a single investment row.  Only provided fields are updated; the
 * rest are preserved from the existing row.
 */
async function handleUpdateInvestment(
  id: string,
  request: Request,
  env: Env,
): Promise<Response> {
  const body: UpdateInvestmentRequest = await request.json();

  // Column 0 = id
  const rowIndex = await findRowIndex('investments', 0, id, env);
  if (rowIndex === null) {
    return errorResponse(`Investment "${id}" not found.`, 404);
  }

  // Read the current row to merge with the patch.
  const rawRows = await readRawRows('investments', env);
  // rawRows[0] is the header; rawRows[rowIndex] is the target (1-based).
  const currentRow = rawRows[rowIndex];
  if (!currentRow) {
    return errorResponse(`Investment row data missing for "${id}".`, 500);
  }

  const headers = rawRows[0];
  if (!headers) {
    return errorResponse('Investment sheet has no header row.', 500);
  }
  const current: Record<string, string | undefined> = Object.fromEntries(
    headers.map((h, i) => [h, currentRow[i] ?? '']),
  );

  const merged: Investment = {
    id: field(current, 'id'),
    batch_id: body.batch_id ?? field(current, 'batch_id'),
    ticker: body.ticker ?? field(current, 'ticker'),
    name: body.name ?? field(current, 'name'),
    market: (body.market ?? field(current, 'market')) as 'TW' | 'US',
    date: body.date ?? field(current, 'date'),
    units: body.units !== undefined ? body.units : Number(field(current, 'units')),
    price_per_unit:
      body.price_per_unit !== undefined
        ? body.price_per_unit
        : Number(field(current, 'price_per_unit')),
    exchange_rate:
      body.exchange_rate !== undefined
        ? body.exchange_rate
        : Number(field(current, 'exchange_rate')),
    fees: body.fees !== undefined ? body.fees : Number(field(current, 'fees')),
    tags: body.tags ?? field(current, 'tags'),
  };

  await updateRow('investments', rowIndex, investmentToRow(merged), env);

  return jsonResponse(merged);
}

/**
 * DELETE /api/investments/:id
 *
 * Deletes a single investment row by its ID.
 */
async function handleDeleteInvestment(id: string, env: Env): Promise<Response> {
  const rowIndex = await findRowIndex('investments', 0, id, env);
  if (rowIndex === null) {
    return errorResponse(`Investment "${id}" not found.`, 404);
  }

  await deleteRow('investments', rowIndex, env);

  return jsonResponse({ deleted: id });
}

/**
 * PUT /api/batches/:id
 *
 * Updates a single batch row (date and/or description).
 */
async function handleUpdateBatch(
  id: string,
  request: Request,
  env: Env,
): Promise<Response> {
  const body: UpdateBatchRequest = await request.json();

  // Column 0 = batch_id
  const rowIndex = await findRowIndex('batches', 0, id, env);
  if (rowIndex === null) {
    return errorResponse(`Batch "${id}" not found.`, 404);
  }

  const rawRows = await readRawRows('batches', env);
  const currentRow = rawRows[rowIndex];
  if (!currentRow) {
    return errorResponse(`Batch row data missing for "${id}".`, 500);
  }

  const headers = rawRows[0];
  if (!headers) {
    return errorResponse('Batch sheet has no header row.', 500);
  }
  const current: Record<string, string | undefined> = Object.fromEntries(
    headers.map((h, i) => [h, currentRow[i] ?? '']),
  );

  const merged: Batch = {
    batch_id: field(current, 'batch_id'),
    date: body.date ?? field(current, 'date'),
    description: body.description ?? field(current, 'description'),
  };

  await updateRow('batches', rowIndex, batchToRow(merged), env);

  return jsonResponse(merged);
}

/**
 * DELETE /api/batches/:id
 *
 * Deletes a batch and all related funding_sources and investments.
 *
 * Rows are deleted from highest index to lowest to avoid index shifting that
 * would corrupt subsequent deletes within the same sheet.
 */
async function handleDeleteBatch(id: string, env: Env): Promise<Response> {
  // Find the batch row itself (column 0 = batch_id).
  const batchRowIndex = await findRowIndex('batches', 0, id, env);
  if (batchRowIndex === null) {
    return errorResponse(`Batch "${id}" not found.`, 404);
  }

  // Find all related funding_source rows (column 0 = batch_id).
  const fundingSourceIndices = await findAllRowIndices(
    'funding_sources',
    0,
    id,
    env,
  );

  // Find all related investment rows (column 1 = batch_id).
  const investmentIndices = await findAllRowIndices('investments', 1, id, env);

  // Delete investments (descending order to avoid row-shift issues).
  for (const rowIdx of investmentIndices.sort((a, b) => b - a)) {
    await deleteRow('investments', rowIdx, env);
  }

  // Delete funding sources (descending order).
  for (const rowIdx of fundingSourceIndices.sort((a, b) => b - a)) {
    await deleteRow('funding_sources', rowIdx, env);
  }

  // Delete the batch itself.
  await deleteRow('batches', batchRowIndex, env);

  return jsonResponse({
    deleted: {
      batch_id: id,
      investments_deleted: investmentIndices.length,
      funding_sources_deleted: fundingSourceIndices.length,
    },
  });
}

/**
 * GET /api/search-ticker?q=keyword
 *
 * Proxies Yahoo Finance's search API and returns simplified results.
 */
async function handleSearchTicker(query: string): Promise<Response> {
  if (!query || query.length < 1) {
    return jsonResponse([]);
  }

  const yahooUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&enableFuzzyQuery=false`;

  const res = await fetch(yahooUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  if (!res.ok) {
    return jsonResponse([]);
  }

  const data = (await res.json()) as {
    quotes?: Array<{
      symbol?: string;
      shortname?: string;
      longname?: string;
      quoteType?: string;
      exchDisp?: string;
    }>;
  };

  const quotes = (data.quotes ?? [])
    .filter((q) => {
      if (!q.symbol || (q.quoteType !== 'EQUITY' && q.quoteType !== 'ETF')) return false;
      const s = q.symbol;
      // Only keep TW (.TW, .TWO) and US (no suffix) tickers
      return /\.TW[O]?$/.test(s) || !s.includes('.');
    })
    .map((q) => {
      const symbol = q.symbol ?? '';
      const market: 'TW' | 'US' = /\.TW[O]?$/.test(symbol) ? 'TW' : 'US';
      return {
        ticker: symbol,
        name: q.shortname ?? q.longname ?? '',
        market,
        exchange: q.exchDisp ?? '',
      };
    });

  return jsonResponse(quotes);
}

// ---------------------------------------------------------------------------
// Ticker tag handlers
// ---------------------------------------------------------------------------

/**
 * Serialises a TickerTag to a flat string array:
 * ticker | dimension | tag
 */
function tickerTagToRow(tt: TickerTag): string[] {
  return [tt.ticker, tt.dimension, tt.tag];
}

/**
 * PUT /api/ticker-tags
 *
 * Batch upsert ticker tag assignments.  For each (ticker, dimension) pair,
 * updates the existing row or appends a new one.
 */
async function handleUpsertTickerTags(
  request: Request,
  env: Env,
): Promise<Response> {
  const body: UpsertTickerTagsRequest = await request.json();

  if (!body.assignments || !Array.isArray(body.assignments)) {
    return errorResponse('Request body must include assignments array.', 400);
  }

  const rawRows = await readRawRows('ticker_tags', env);
  const headers = rawRows[0];

  // Build a map of existing rows: "ticker|dimension" → 1-based row index
  const existingMap = new Map<string, number>();
  if (headers) {
    const tickerCol = headers.indexOf('ticker');
    const dimCol = headers.indexOf('dimension');
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (row) {
        const key = `${row[tickerCol] ?? ''}|${row[dimCol] ?? ''}`;
        existingMap.set(key, i + 1); // 1-based (header = row 1)
      }
    }
  }

  const toAppend: string[][] = [];
  const toDelete: number[] = [];

  for (const assignment of body.assignments) {
    const key = `${assignment.ticker}|${assignment.dimension}`;
    const rowIndex = existingMap.get(key);

    if (!assignment.tag) {
      // Empty tag means deletion
      if (rowIndex !== undefined) {
        toDelete.push(rowIndex);
      }
    } else if (rowIndex !== undefined) {
      await updateRow('ticker_tags', rowIndex, tickerTagToRow(assignment), env);
    } else {
      toAppend.push(tickerTagToRow(assignment));
    }
  }

  // Delete rows from highest index to lowest to avoid row-shift issues
  for (const rowIdx of toDelete.sort((a, b) => b - a)) {
    await deleteRow('ticker_tags', rowIdx, env);
  }

  if (toAppend.length > 0) {
    await appendRows('ticker_tags', toAppend, env);
  }

  return jsonResponse({ updated: body.assignments.length });
}

/**
 * DELETE /api/dimensions/:name
 *
 * Deletes all ticker_tags rows belonging to the specified dimension.
 */
async function handleDeleteDimension(
  name: string,
  env: Env,
): Promise<Response> {
  // dimension is column index 1 in ticker_tags sheet
  const indices = await findAllRowIndices('ticker_tags', 1, name, env);

  // Delete from highest index to lowest to avoid row-shift issues.
  for (const rowIdx of indices.sort((a, b) => b - a)) {
    await deleteRow('ticker_tags', rowIdx, env);
  }

  return jsonResponse({ deleted_dimension: name, rows_deleted: indices.length });
}

/**
 * PUT /api/dimensions/:name/rename
 *
 * Renames a dimension by updating the dimension column of all matching rows.
 */
async function handleRenameDimension(
  name: string,
  request: Request,
  env: Env,
): Promise<Response> {
  const body: RenameDimensionRequest = await request.json();

  if (!body.new_name) {
    return errorResponse('Request body must include new_name.', 400);
  }

  const rawRows = await readRawRows('ticker_tags', env);
  const headers = rawRows[0];
  if (!headers) {
    return jsonResponse({ renamed: 0 });
  }

  const dimCol = headers.indexOf('dimension');
  let renamed = 0;

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (row && row[dimCol] === name) {
      const updatedRow = [...row];
      updatedRow[dimCol] = body.new_name;
      await updateRow('ticker_tags', i + 1, updatedRow, env); // 1-based
      renamed++;
    }
  }

  return jsonResponse({ renamed });
}

// ---------------------------------------------------------------------------
// Backfill handler
// ---------------------------------------------------------------------------

/**
 * POST /api/backfill
 *
 * Fetches historical prices for all invested tickers and USD/TWD exchange
 * rates from Yahoo Finance, deduplicates against existing data, and appends
 * new records to the Google Sheets.
 */
async function handleBackfill(env: Env): Promise<Response> {
  // 1. Read investments, existing prices, and existing exchange rates in parallel.
  const [investmentRows, priceRows, exchangeRateRows] = await Promise.all([
    readSheet('investments', env),
    readSheet('prices', env),
    readSheet('exchange_rates', env),
  ]);

  // 2. Determine each ticker's earliest investment date.
  const tickerEarliestDate = new Map<string, string>();
  for (const row of investmentRows) {
    const ticker = field(row, 'ticker');
    const date = field(row, 'date');
    if (!ticker || !date) continue;

    const existing = tickerEarliestDate.get(ticker);
    if (!existing || date < existing) {
      tickerEarliestDate.set(ticker, date);
    }
  }

  if (tickerEarliestDate.size === 0) {
    return jsonResponse({ prices_added: 0, rates_added: 0 } satisfies BackfillResponse);
  }

  // 3. Build existing data sets for deduplication.
  const existingPriceKeys = new Set<string>();
  for (const row of priceRows) {
    const ticker = field(row, 'ticker');
    const date = field(row, 'date');
    if (ticker && date) existingPriceKeys.add(`${ticker}|${date}`);
  }

  const existingRateDates = new Set<string>();
  for (const row of exchangeRateRows) {
    const date = field(row, 'date');
    if (date) existingRateDates.add(date);
  }

  // 4. Fetch prices for all tickers in parallel.
  const tickerEntries = Array.from(tickerEarliestDate.entries());
  const priceResults = await Promise.all(
    tickerEntries.map(([ticker, startDate]) =>
      fetchYahooPrices(ticker, startDate).catch((err) => {
        console.error(`[Backfill] Failed to fetch prices for ${ticker}: ${err}`);
        return [];
      }),
    ),
  );

  // 5. Fetch exchange rates from the global earliest date.
  const allDates = Array.from(tickerEarliestDate.values());
  const globalEarliestDate = allDates.reduce((a, b) => (a < b ? a : b));

  const rateResults = await fetchYahooRates(globalEarliestDate).catch((err) => {
    console.error(`[Backfill] Failed to fetch exchange rates: ${err}`);
    return [];
  });

  // 6. Deduplicate prices.
  const newPriceRows: string[][] = [];
  for (const records of priceResults) {
    for (const rec of records) {
      const key = `${rec.ticker}|${rec.date}`;
      if (!existingPriceKeys.has(key)) {
        newPriceRows.push([rec.ticker, rec.date, String(rec.close)]);
        existingPriceKeys.add(key); // prevent duplicates within the same batch
      }
    }
  }

  // 7. Deduplicate exchange rates.
  const newRateRows: string[][] = [];
  for (const rec of rateResults) {
    if (!existingRateDates.has(rec.date)) {
      newRateRows.push([rec.date, String(rec.usd_twd)]);
      existingRateDates.add(rec.date);
    }
  }

  // 8. Append new rows to sheets.
  if (newPriceRows.length > 0) {
    await appendRows('prices', newPriceRows, env);
  }
  if (newRateRows.length > 0) {
    await appendRows('exchange_rates', newRateRows, env);
  }

  const result: BackfillResponse = {
    prices_added: newPriceRows.length,
    rates_added: newRateRows.length,
  };

  console.log(`[Backfill] Completed: ${result.prices_added} prices, ${result.rates_added} rates added.`);

  return jsonResponse(result);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Parses a URL pathname into a route descriptor.
 *
 * Returns `null` for paths that do not match any known route.
 */
function matchRoute(
  method: string,
  pathname: string,
):
  | { route: 'get_portfolio' }
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
  | null {
  if (method === 'GET' && pathname === '/api/portfolio') {
    return { route: 'get_portfolio' };
  }
  if (method === 'GET' && pathname === '/api/search-ticker') {
    return { route: 'search_ticker', query: '' };
  }
  if (method === 'POST' && pathname === '/api/batches') {
    return { route: 'create_batch' };
  }
  if (method === 'PUT' && pathname === '/api/ticker-tags') {
    return { route: 'upsert_ticker_tags' };
  }
  if (method === 'POST' && pathname === '/api/backfill') {
    return { route: 'backfill' };
  }

  const investmentMatch = pathname.match(/^\/api\/investments\/([^/]+)$/);
  if (investmentMatch) {
    const id = investmentMatch[1];
    // id is always present when the regex matches.
    if (id !== undefined) {
      if (method === 'PUT') return { route: 'update_investment', id };
      if (method === 'DELETE') return { route: 'delete_investment', id };
    }
  }

  const batchMatch = pathname.match(/^\/api\/batches\/([^/]+)$/);
  if (batchMatch) {
    const id = batchMatch[1];
    if (id !== undefined) {
      if (method === 'PUT') return { route: 'update_batch', id };
      if (method === 'DELETE') return { route: 'delete_batch', id };
    }
  }

  const dimRenameMatch = pathname.match(/^\/api\/dimensions\/([^/]+)\/rename$/);
  if (dimRenameMatch) {
    const name = decodeURIComponent(dimRenameMatch[1] ?? '');
    if (name && method === 'PUT') return { route: 'rename_dimension', name };
  }

  const dimMatch = pathname.match(/^\/api\/dimensions\/([^/]+)$/);
  if (dimMatch) {
    const name = decodeURIComponent(dimMatch[1] ?? '');
    if (name && method === 'DELETE') return { route: 'delete_dimension', name };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Worker fetch handler
// ---------------------------------------------------------------------------

export default {
  /**
   * Main Worker fetch handler.  Dispatches to the appropriate route handler
   * and wraps every handler in a top-level try/catch.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { method, url: rawUrl } = request;
    const pathname = url.pathname;

    // Handle CORS preflight requests.
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Validate API key.
    const apiKey = request.headers.get('X-API-Key');
    if (!apiKey || apiKey !== env.API_KEY) {
      return errorResponse('Unauthorized: invalid or missing API key.', 401);
    }

    const matched = matchRoute(method, pathname);

    if (matched === null) {
      return errorResponse(`Route not found: ${method} ${pathname}`, 404);
    }

    // Inject query string for search-ticker route.
    if (matched.route === 'search_ticker') {
      matched.query = url.searchParams.get('q') ?? '';
    }

    try {
      switch (matched.route) {
        case 'get_portfolio':
          return await handleGetPortfolio(env);

        case 'search_ticker':
          return await handleSearchTicker(matched.query);

        case 'create_batch':
          return await handleCreateBatch(request, env);

        case 'update_investment':
          return await handleUpdateInvestment(matched.id, request, env);

        case 'delete_investment':
          return await handleDeleteInvestment(matched.id, env);

        case 'update_batch':
          return await handleUpdateBatch(matched.id, request, env);

        case 'delete_batch':
          return await handleDeleteBatch(matched.id, env);

        case 'upsert_ticker_tags':
          return await handleUpsertTickerTags(request, env);

        case 'delete_dimension':
          return await handleDeleteDimension(matched.name, env);

        case 'rename_dimension':
          return await handleRenameDimension(matched.name, request, env);

        case 'backfill':
          return await handleBackfill(env);

        default: {
          // TypeScript exhaustiveness check.
          const _exhaustive: never = matched;
          void _exhaustive;
          return errorResponse('Unhandled route.', 500);
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.';
      console.error(`[Worker] Error handling ${method} ${rawUrl}: ${message}`);
      return errorResponse(message, 500);
    }
  },
} satisfies ExportedHandler<Env>;
