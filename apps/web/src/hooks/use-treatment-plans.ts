import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface TreatmentCategory {
  id: string;
  name: string;
}

export interface TreatmentPlanItem {
  id: string;
  description: string;
  toothNumber: string | null;
  quantity: number;
  cost: number;
  status: string;
  treatmentCategory: TreatmentCategory | null;
}

export interface TreatmentPlan {
  id: string;
  title: string;
  status: string;
  totalCost: number;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  patient: { id: string; firstName: string; lastName: string };
  createdBy: { id: string; firstName: string; lastName: string };
  items: TreatmentPlanItem[];
}

export function useTreatmentPlans(patientId: string) {
  const { accessToken } = useAuth();
  return useQuery<TreatmentPlan[]>({
    queryKey: ['treatment-plans', patientId],
    queryFn: () =>
      apiRequest(`/api/treatment-plans?patientId=${patientId}`, {}, accessToken ?? undefined),
    enabled: !!patientId,
  });
}

export function useTreatmentCategories() {
  const { accessToken } = useAuth();
  return useQuery<TreatmentCategory[]>({
    queryKey: ['treatment-categories'],
    queryFn: () => apiRequest('/api/treatment-plans/categories', {}, accessToken ?? undefined),
  });
}

export function useCreateTreatmentPlan() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      patientId: string;
      title: string;
      notes?: string;
      currency?: string;
      items?: { description: string; quantity: number; cost: number; toothNumber?: string; treatmentCategoryId?: string }[];
    }) =>
      apiRequest('/api/treatment-plans', { method: 'POST', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: (_: unknown, vars: { patientId: string }) =>
      qc.invalidateQueries({ queryKey: ['treatment-plans', vars.patientId] }),
  });
}

export function useUpdateTreatmentPlanStatus(patientId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest(
        `/api/treatment-plans/${id}/status`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['treatment-plans', patientId] }),
  });
}
