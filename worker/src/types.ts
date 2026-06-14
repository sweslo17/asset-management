/**
 * Shared TypeScript interfaces for the Asset Management Cloudflare Worker API.
 * These interfaces mirror the Google Sheets schemas exactly.
 */

/**
 * Represents a single investment batch (a grouping of purchases made at one time).
 */
export interface Batch {
  batch_id: string;
  date: string;
  description: string;
  /** 'contribution'（投入，新資金）| 'rebalance'（轉換，重組持股）。預設 contribution。 */
  type?: 'contribution' | 'rebalance';
}

/**
 * Represents a funding source that contributes capital to a batch.
 */
export interface FundingSource {
  batch_id: string;
  source_name: string;
  amount_twd: number;
}

/**
 * Represents a single investment transaction.
 * @property market - The exchange market; "TW" for Taiwan Stock Exchange, "US" for US markets.
 * @property tags   - Comma-separated tag string stored as a single cell value.
 */
export interface Investment {
  id: string;
  batch_id: string;
  ticker: string;
  name: string;
  market: 'TW' | 'US';
  date: string;
  units: number;
  price_per_unit: number;
  exchange_rate: number;
  fees: number;
  tags: string;
  /** 'buy' | 'sell' | 'rebalance'. 預設 buy；負 units 表示賣出。 */
  txn_type?: 'buy' | 'sell' | 'rebalance';
}

/**
 * Represents a historical closing price record for a given ticker on a given date.
 */
export interface PriceRecord {
  ticker: string;
  date: string;
  close: number;
}

/**
 * Represents a daily USD/TWD exchange rate.
 */
export interface ExchangeRate {
  date: string;
  usd_twd: number;
}

/**
 * Represents a generic key/value metadata entry stored in the metadata sheet.
 */
export interface Metadata {
  key: string;
  value: string;
}

/**
 * Represents a per-ticker dimensional tag assignment.
 * Each row maps a ticker to a single tag within a named dimension.
 */
export interface TickerTag {
  ticker: string;
  dimension: string;
  tag: string;
}

/**
 * Aggregated snapshot of all portfolio data read from every sheet.
 */
export interface PortfolioData {
  batches: Batch[];
  funding_sources: FundingSource[];
  investments: Investment[];
  prices: PriceRecord[];
  exchange_rates: ExchangeRate[];
  metadata: Metadata[];
  ticker_tags: TickerTag[];
}

/**
 * Cloudflare Worker environment bindings.
 * Secrets are injected at runtime via `wrangler secret put`.
 */
export interface Env {
  /** Cloudflare D1 database binding (see wrangler.toml [[d1_databases]]). */
  DB: D1Database;
  /** API key required in the X-API-Key header for app routes. */
  API_KEY: string;
  /** Read-only token for GET /api/sleeve-summary?token= (used by investment-judgement). */
  READ_TOKEN: string;
  /**
   * Optional comma-separated list of allowed browser origins for CORS.
   * 未設定 → '*'（相容）。設為 Pages 網址可把 key 鎖在你的網站，降低瀏覽器端盜用。
   * 例：https://asset-management-web.pages.dev
   */
  ALLOWED_ORIGINS?: string;
}

// ---------------------------------------------------------------------------
// Request body types
// ---------------------------------------------------------------------------

/**
 * Request body for POST /api/batches.
 * Creates a batch together with its funding sources and investments atomically.
 */
export interface CreateBatchRequest {
  batch: {
    date: string;
    description: string;
  };
  funding_sources: Array<{
    source_name: string;
    amount_twd: number;
  }>;
  investments: Array<Omit<Investment, 'id' | 'batch_id'>>;
}

/**
 * Request body for POST /api/rebalance（記錄一次轉換）。
 * trades：每筆是一個淨變動。units_delta 正=買入、負=賣出。
 * 賣出時系統會以該 ticker 目前平均成本計算已實現損益。
 */
export interface RebalanceRequest {
  date: string;
  description: string;
  trades: Array<{
    ticker: string;
    name?: string;
    market: 'TW' | 'US';
    units_delta: number;       // 正=買、負=賣（台股以「張」計）
    price_per_unit: number;
    exchange_rate?: number;    // US 必填；TW 預設 1
    fees?: number;
  }>;
}

/** POST /api/rebalance 回應：含每筆賣出的已實現損益。 */
export interface RebalanceResponse {
  batch_id: string;
  realized_pl_twd: number;
  legs: Array<{ ticker: string; units_delta: number; realized_pl_twd: number | null }>;
}

/**
 * Request body for PUT /api/investments/:id.
 */
export type UpdateInvestmentRequest = Partial<Omit<Investment, 'id'>>;

/**
 * Request body for PUT /api/batches/:id.
 */
export type UpdateBatchRequest = Partial<Omit<Batch, 'batch_id'>>;

/**
 * Request body for PUT /api/ticker-tags.
 * Batch upsert: for each assignment, find the row with the same ticker+dimension
 * and update its tag, or append a new row if not found.
 */
export interface UpsertTickerTagsRequest {
  assignments: TickerTag[];
}

/**
 * Request body for PUT /api/dimensions/:name/rename.
 */
export interface RenameDimensionRequest {
  new_name: string;
}

/**
 * Response body for POST /api/backfill.
 */
export interface BackfillResponse {
  prices_added: number;
  rates_added: number;
}

/**
 * Response body for GET /api/quote.
 *
 * Returns the closing price (and USD/TWD rate, for US tickers) on or before
 * the requested date. The `date` field reflects the actual trading day used,
 * which may differ from the request date if it falls on a weekend or holiday.
 */
export interface QuoteResponse {
  ticker: string;
  date: string;
  close: number;
  usd_twd: number | null;
}

// ---------------------------------------------------------------------------
// Internal helper types
// ---------------------------------------------------------------------------

/**
 * A raw row from Google Sheets represented as a flat string array.
 */
export type SheetRow = string[];

/**
 * Parsed Google Service Account JSON credential structure.
 */
export interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

/**
 * Cached OAuth2 access token with its expiry timestamp.
 */
export interface CachedToken {
  access_token: string;
  /** Unix timestamp in milliseconds when the token expires. */
  expires_at: number;
}

/**
 * Response body returned by Google's OAuth2 token endpoint.
 */
export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}
