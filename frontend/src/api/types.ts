export interface Batch {
  batch_id: string;
  date: string;
  description: string;
}

export interface FundingSource {
  batch_id: string;
  source_name: string;
  amount_twd: number;
}

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

export interface PriceRecord {
  ticker: string;
  date: string;
  close: number;
}

export interface ExchangeRate {
  date: string;
  usd_twd: number;
}

export interface Metadata {
  key: string;
  value: string;
}

export interface PortfolioData {
  batches: Batch[];
  funding_sources: FundingSource[];
  investments: Investment[];
  prices: PriceRecord[];
  exchange_rates: ExchangeRate[];
  metadata: Metadata[];
}

export interface CreateBatchRequest {
  batch: { date: string; description: string };
  funding_sources: { source_name: string; amount_twd: number }[];
  investments: Omit<Investment, 'id' | 'batch_id'>[];
}

export interface CreateBatchResponse {
  batch: Batch;
  funding_sources: FundingSource[];
  investments: Investment[];
}
