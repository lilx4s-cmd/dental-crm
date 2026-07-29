import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  nationalId: string | null;
  notes: string | null;
  allergies: string | null;
  diagnosis: string | null;
  insuranceInfo: string | null;
  isActive: boolean;
  convertedFromLeadId: string | null;
  createdAt: string;
  updatedAt: string;
  tags: { tag: { id: string; name: string; color: string } }[];
}

export interface PatientsResponse {
  data: Patient[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface PatientsQuery {
  page?: number;
  limit?: number;
  search?: string;
  tagId?: string;
}

export function usePatients(query: PatientsQuery = {}) {
  const { accessToken } = useAuth();
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  if (query.tagId) params.set('tagId', query.tagId);

  return useQuery<PatientsResponse>({
    queryKey: ['patients', query],
    queryFn: () => apiRequest(`/api/patients?${params}`, {}, accessToken ?? undefined),
  });
}

/**
 * One patient's clinical record.
 *
 * `enabled` lets a caller who knows the current role cannot read clinical records skip the request
 * instead of firing one it knows will be refused. A 403 in the console reads as a defect to
 * whoever finds it next, and this one is a policy decision rather than a failure.
 */
export function usePatient(id: string, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<Patient>({
    queryKey: ['patients', id],
    queryFn: () => apiRequest(`/api/patients/${id}`, {}, accessToken ?? undefined),
    enabled: enabled && !!id,
  });
}

export function useCreatePatient() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Patient>) =>
      apiRequest('/api/patients', { method: 'POST', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }),
  });
}

export function useUpdatePatient(id: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Patient>) =>
      apiRequest(`/api/patients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['patients', id] });
    },
  });
}
