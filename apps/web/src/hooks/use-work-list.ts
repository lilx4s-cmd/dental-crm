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

/**
 * An open reminder, with the deal it sits on.
 *
 * Carries the lead's own fields rather than a full `Lead`, because this list deliberately includes
 * tasks on won and archived deals — "send the warranty certificate" is due whether or not the sale
 * closed — and those never appear in the pipeline lists a `Lead` comes from.
 */
export interface WorkTask {
  id: string;
  title: string;
  dueDate: string;
  overdue: boolean;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  lead: {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
    whatsappNumber: string | null;
    country: string | null;
    stage: string;
    status: string;
  };
}

export interface WorkList {
  due: WorkItem[];
  dormant: WorkItem[];
  tasks: WorkTask[];
  counts: {
    due: number;
    dormant: number;
    tasks: number;
    tasksOverdue: number;
    openPipeline: number;
  };
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
