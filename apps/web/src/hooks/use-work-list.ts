import { useQuery } from '@tanstack/react-query';
import type { NextAction } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import type { Lead } from './use-leads';

export interface WorkItem {
  lead: Lead;
  action: NextAction;
  /** How to re-approach a cold deal — present on the recycling list only. */
  recycleAngle?: string | null;
}

export interface WorkList {
  due: WorkItem[];
  dormant: WorkItem[];
  counts: { due: number; dormant: number; openPipeline: number };
}

export function useWorkList() {
  const { accessToken } = useAuth();
  return useQuery<WorkList>({
    queryKey: ['work-list'],
    queryFn: () => apiRequest('/api/leads/work-list', {}, accessToken ?? undefined),
    // The list is a morning routine, not a live feed — refetching on every focus would reshuffle
    // it under someone mid-call.
    refetchOnWindowFocus: false,
  });
}
