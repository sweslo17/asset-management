import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { PortfolioData } from '@/api/types';

export function usePortfolioData() {
  return useQuery<PortfolioData>({
    queryKey: ['portfolio'],
    queryFn: api.getPortfolio,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}
