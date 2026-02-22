import type {
  PortfolioData,
  CreateBatchRequest,
  CreateBatchResponse,
  Investment,
  Batch,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });
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
};
