import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { CreateBatchRequest, Investment, Batch } from '@/api/types';

export function useCreateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBatchRequest) => api.createBatch(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useUpdateInvestment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Investment> }) =>
      api.updateInvestment(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useDeleteInvestment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteInvestment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useUpdateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Batch> }) =>
      api.updateBatch(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useDeleteBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteBatch(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}
