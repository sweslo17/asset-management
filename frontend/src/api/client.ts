import type {
  BackfillResponse,
  PortfolioData,
  CreateBatchRequest,
  CreateBatchResponse,
  Investment,
  Batch,
  TickerSearchResult,
  UpsertTickerTagsRequest,
  RenameDimensionRequest,
} from './types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

const API_KEY_STORAGE_KEY = 'asset_mgmt_api_key';

export function getStoredApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setStoredApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function clearStoredApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const apiKey = getStoredApiKey();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    clearStoredApiKey();
    window.location.reload();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getPortfolio: () => request<PortfolioData>('/api/portfolio'),

  createBatch: (data: CreateBatchRequest) =>
    request<CreateBatchResponse>('/api/batches', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateInvestment: (id: string, data: Partial<Investment>) =>
    request<Investment>(`/api/investments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteInvestment: (id: string) =>
    request<{ deleted: string }>(`/api/investments/${id}`, {
      method: 'DELETE',
    }),

  updateBatch: (id: string, data: Partial<Batch>) =>
    request<Batch>(`/api/batches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteBatch: (id: string) =>
    request<{
      deleted: {
        batch_id: string;
        investments_deleted: number;
        funding_sources_deleted: number;
      };
    }>(`/api/batches/${id}`, { method: 'DELETE' }),

  searchTicker: (query: string) =>
    request<TickerSearchResult[]>(`/api/search-ticker?q=${encodeURIComponent(query)}`),

  upsertTickerTags: (data: UpsertTickerTagsRequest) =>
    request<{ updated: number }>('/api/ticker-tags', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteDimension: (name: string) =>
    request<{ deleted_dimension: string; rows_deleted: number }>(
      `/api/dimensions/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),

  renameDimension: (name: string, newName: string) =>
    request<{ renamed: number }>(
      `/api/dimensions/${encodeURIComponent(name)}/rename`,
      { method: 'PUT', body: JSON.stringify({ new_name: newName } satisfies RenameDimensionRequest) },
    ),

  backfill: () =>
    request<BackfillResponse>('/api/backfill', { method: 'POST' }),
};
