import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface Lead {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  source: string;
  stage: string;
  status: string;
  estimatedValue: number | null;
  currency: string;
  lostReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTo: { id: string; firstName: string; lastName: string; email: string } | null;
  campaign: { id: string; name: string; platform: string } | null;
  patient: { id: string; firstName: string; lastName: string } | null;
}

export interface PipelineGroup {
  stage: string;
  leads: Lead[];
}

export interface LeadsQuery {
  page?: number;
  limit?: number;
  search?: string;
  stage?: string;
  status?: string;
}

export function useLeadsByStage() {
  const { accessToken } = useAuth();
  return useQuery<PipelineGroup[]>({
    queryKey: ['leads', 'by-stage'],
    queryFn: () => apiRequest('/api/leads/by-stage', {}, accessToken ?? undefined),
  });
}

export function useLeads(query: LeadsQuery = {}) {
  const { accessToken } = useAuth();
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  if (query.stage) params.set('stage', query.stage);
  if (query.status) params.set('status', query.status);

  return useQuery({
    queryKey: ['leads', query],
    queryFn: () => apiRequest(`/api/leads?${params}`, {}, accessToken ?? undefined),
  });
}

export function useLead(id: string) {
  const { accessToken } = useAuth();
  return useQuery<Lead>({
    queryKey: ['leads', id],
    queryFn: () => apiRequest(`/api/leads/${id}`, {}, accessToken ?? undefined),
    enabled: !!id,
  });
}

export function useCreateLead() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Lead>) =>
      apiRequest('/api/leads', { method: 'POST', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateLeadStage() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage, note }: { id: string; stage: string; note?: string }) =>
      apiRequest(`/api/leads/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage, note }) }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useConvertLeadToPatient() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/leads/${id}/convert`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
