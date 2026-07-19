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
  assignedToId?: string;
  /** Set false to skip firing the query (e.g. while a dependent selection is empty). Defaults to true. */
  enabled?: boolean;
}

export interface LeadsListResponse {
  data: Lead[];
  meta: { total: number; page: number; limit: number; totalPages: number };
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
  const { enabled = true, ...rest } = query;
  const params = new URLSearchParams();
  if (rest.page) params.set('page', String(rest.page));
  if (rest.limit) params.set('limit', String(rest.limit));
  if (rest.search) params.set('search', rest.search);
  if (rest.stage) params.set('stage', rest.stage);
  if (rest.status) params.set('status', rest.status);
  if (rest.assignedToId) params.set('assignedToId', rest.assignedToId);

  return useQuery<LeadsListResponse>({
    queryKey: ['leads', rest],
    queryFn: () => apiRequest(`/api/leads?${params}`, {}, accessToken ?? undefined),
    enabled: enabled && !!accessToken,
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

// ─── Sales team: transfer + activity history ──────────────────────────────────

export interface TransferPayload {
  toUserId: string;
  fromUserId?: string;
  leadIds?: string[];
  note?: string;
}

export interface TransferResult {
  transferred: number;
  toUserId: string;
}

export function useTransferLeads() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<TransferResult, Error, TransferPayload>({
    mutationFn: (payload) =>
      apiRequest('/api/leads/transfer', { method: 'POST', body: JSON.stringify(payload) }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['sales-activity'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export interface SalesActivity {
  id: string;
  leadId: string;
  userId: string | null;
  fromStage: string | null;
  toStage: string | null;
  note: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
  lead: { id: string; firstName: string; lastName: string | null; stage: string; status: string } | null;
}

export interface SalesActivityResponse {
  data: SalesActivity[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export function useSalesActivity(query: { page?: number; limit?: number; userId?: string } = {}) {
  const { accessToken } = useAuth();
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.userId) params.set('userId', query.userId);

  return useQuery<SalesActivityResponse>({
    queryKey: ['sales-activity', query],
    queryFn: () => apiRequest(`/api/leads/activity?${params}`, {}, accessToken ?? undefined),
  });
}
