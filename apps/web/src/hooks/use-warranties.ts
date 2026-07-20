import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface WarrantyTemplate {
  id: string;
  name: string;
  treatmentCategoryId: string | null;
  durationMonths: number;
  termsAndConditions: string;
  maintenanceRequirements: string | null;
  exclusions: string | null;
  annualCheckupRequired: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Warranty {
  id: string;
  treatmentPlanItemId: string;
  warrantyTemplateId: string | null;
  startDate: string;
  durationMonths: number;
  status: 'ACTIVE' | 'EXPIRED' | 'VOIDED' | 'CLAIMED';
  termsAndConditions: string;
  maintenanceRequirements: string | null;
  exclusions: string | null;
  annualCheckupRequired: boolean;
  certificateFileId: string | null;
  createdAt: string;
  updatedAt: string;
  warrantyTemplate: { id: string; name: string } | null;
  treatmentPlanItem: { id: string; description: string; toothNumber: string | null; treatmentPlanId: string };
}

export interface CreateWarrantyTemplateInput {
  name: string;
  treatmentCategoryId?: string;
  durationMonths: number;
  termsAndConditions: string;
  maintenanceRequirements?: string;
  exclusions?: string;
  annualCheckupRequired?: boolean;
}

export interface IssueWarrantyInput {
  warrantyTemplateId?: string;
  startDate?: string;
  durationMonths?: number;
  termsAndConditions?: string;
  maintenanceRequirements?: string;
  exclusions?: string;
  annualCheckupRequired?: boolean;
}

export function useWarrantyTemplates(isActive?: boolean) {
  const { accessToken } = useAuth();
  const qs = isActive === undefined ? '' : `?isActive=${isActive}`;
  return useQuery<WarrantyTemplate[]>({
    queryKey: ['warranty-templates', isActive],
    queryFn: () => apiRequest(`/api/warranty-templates${qs}`, {}, accessToken ?? undefined),
  });
}

export function useCreateWarrantyTemplate() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWarrantyTemplateInput) =>
      apiRequest('/api/warranty-templates', { method: 'POST', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warranty-templates'] }),
  });
}

export function usePatientWarranties(patientId: string) {
  const { accessToken } = useAuth();
  return useQuery<Warranty[]>({
    queryKey: ['warranties', patientId],
    queryFn: () => apiRequest(`/api/warranties?patientId=${patientId}`, {}, accessToken ?? undefined),
    enabled: !!patientId,
  });
}

export function useIssueWarranty(patientId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...data }: IssueWarrantyInput & { itemId: string }) =>
      apiRequest(
        `/api/treatment-plan-items/${itemId}/warranty`,
        { method: 'POST', body: JSON.stringify(data) },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warranties', patientId] }),
  });
}
