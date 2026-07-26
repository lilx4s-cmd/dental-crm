import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseEconomics } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface CaseInvoice {
  id: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  status: string;
  issuedAt: string | null;
  paid: number;
}

export interface CaseAppointment {
  id: string;
  startTime: string;
  endTime: string;
  type: string;
  status: string;
  dentist: { id: string; firstName: string; lastName: string } | null;
}

export interface CaseFile {
  patient: {
    id: string;
    caseNumber: string | null;
    firstName: string;
    lastName: string;
    aftercareStartedAt: string | null;
    serviceCost: number | null;
    salesCommission: number | null;
    commissionUser: { id: string; firstName: string; lastName: string } | null;
  };
  economics: CaseEconomics;
  currency: string;
  invoices: CaseInvoice[];
  appointments: CaseAppointment[];
}

export function useCaseFile(patientId: string) {
  const { accessToken } = useAuth();
  return useQuery<CaseFile>({
    queryKey: ['case-file', patientId],
    queryFn: () => apiRequest(`/api/patients/${patientId}/case`, {}, accessToken ?? undefined),
    enabled: !!patientId,
  });
}

export function useUpdateCaseEconomics(patientId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { serviceCost?: number; salesCommission?: number; commissionUserId?: string }) =>
      apiRequest(
        `/api/patients/${patientId}/case`,
        { method: 'PATCH', body: JSON.stringify(data) },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['case-file', patientId] }),
  });
}
