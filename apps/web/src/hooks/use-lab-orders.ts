import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export type LabOrderStatus = 'DRAFT' | 'SENT' | 'IN_PRODUCTION' | 'READY' | 'RECEIVED' | 'REMAKE';

export interface LabOrder {
  id: string;
  treatmentPlanId: string;
  labName: string;
  status: LabOrderStatus;
  shade: string | null;
  material: string | null;
  toothNumbers: string[];
  sentAt: string | null;
  /** When the case must be back for the patient's appointment. */
  dueAt: string | null;
  receivedAt: string | null;
  trackingRef: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  treatmentPlan?: {
    id: string;
    title: string;
    patient: { id: string; firstName: string; lastName: string };
  };
}

export interface CreateLabOrderInput {
  labName: string;
  shade?: string;
  material?: string;
  toothNumbers?: string[];
  dueAt?: string;
  trackingRef?: string;
  notes?: string;
}

export interface UpdateLabOrderInput extends Partial<CreateLabOrderInput> {
  status?: LabOrderStatus;
}

export function useLabOrders(treatmentPlanId: string) {
  const { accessToken } = useAuth();
  return useQuery<LabOrder[]>({
    queryKey: ['lab-orders', treatmentPlanId],
    queryFn: () =>
      apiRequest(`/api/treatment-plans/${treatmentPlanId}/lab-orders`, {}, accessToken ?? undefined),
    enabled: !!treatmentPlanId,
  });
}

/** Cases still out at the lab, soonest due first — what is late and what lands this week. */
export function useOpenLabOrders(enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<LabOrder[]>({
    queryKey: ['lab-orders', 'open'],
    queryFn: () => apiRequest('/api/lab-orders', {}, accessToken ?? undefined),
    enabled: enabled && !!accessToken,
  });
}

export function useCreateLabOrder(treatmentPlanId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<LabOrder, Error, CreateLabOrderInput>({
    mutationFn: (data) =>
      apiRequest(
        `/api/treatment-plans/${treatmentPlanId}/lab-orders`,
        { method: 'POST', body: JSON.stringify(data) },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lab-orders'] }),
  });
}

export function useUpdateLabOrder() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<LabOrder, Error, UpdateLabOrderInput & { id: string }>({
    mutationFn: ({ id, ...data }) =>
      apiRequest(
        `/api/lab-orders/${id}`,
        { method: 'PATCH', body: JSON.stringify(data) },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lab-orders'] }),
  });
}
