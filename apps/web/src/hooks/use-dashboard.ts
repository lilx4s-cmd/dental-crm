import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface DashboardStats {
  leadsToday: number;
  leadsTotal: number;
  patientsTotal: number;
  conversionRate: number;
  pipelineValueTotal: number;
  appointmentsToday: number;
}

export interface PipelineGroup {
  stage: string;
  count: number;
  totalValue: number;
  leads: unknown[];
}

export function useDashboardStats() {
  const { accessToken } = useAuth();
  return useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => apiRequest('/api/dashboard/stats', {}, accessToken ?? undefined),
    staleTime: 30_000,
  });
}

export function usePipelineGroups() {
  const { accessToken } = useAuth();
  return useQuery<PipelineGroup[]>({
    queryKey: ['dashboard', 'pipeline'],
    queryFn: () => apiRequest('/api/dashboard/pipeline', {}, accessToken ?? undefined),
    staleTime: 30_000,
  });
}
