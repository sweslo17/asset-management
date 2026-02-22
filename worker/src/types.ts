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
 * Aggregated snapshot of all portfolio data read from every sheet.
 */
export interface PortfolioData {
  batches: Batch[];
  funding_sources: FundingSource[];
  investments: Investment[];
  prices: PriceRecord[];
  exchange_rates: ExchangeRate[];
  metadata: Metadata[];
}

/**
 * Cloudflare Worker environment bindings.
 * Secrets are injected at runtime via `wrangler secret put`.
 */
export interface Env {
  /** Full JSON string of a Google Service Account credentials file. */
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  /** The ID of the target Google Spreadsheet. */
  GOOGLE_SHEETS_ID: string;
  /** API key required in the X-API-Key header for all requests. */
  API_KEY: string;
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
 * Request body for PUT /api/investments/:id.
 */
export type UpdateInvestmentRequest = Partial<Omit<Investment, 'id'>>;

/**
 * Request body for PUT /api/batches/:id.
 */
export type UpdateBatchRequest = Partial<Omit<Batch, 'batch_id'>>;

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
