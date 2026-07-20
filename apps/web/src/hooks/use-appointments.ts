import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface Appointment {
  id: string;
  type: string;
  status: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  cancelReason: string | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string; phone: string | null };
  dentist: { id: string; firstName: string; lastName: string; calendarColor: string | null } | null;
  resource: { id: string; name: string; type: string } | null;
  createdBy: { id: string; firstName: string; lastName: string };
}

// `enabled` defaults to true so existing callers (full calendar views) are
// unaffected; the lead detail sheet passes false until it actually needs a
// converted patient's appointment history, keeping that fetch lazy.
export function useAppointments(from?: string, to?: string, dentistId?: string, patientId?: string, enabled = true) {
  const { accessToken } = useAuth();
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (dentistId) params.set('dentistId', dentistId);
  if (patientId) params.set('patientId', patientId);

  return useQuery<Appointment[]>({
    queryKey: ['appointments', from, to, dentistId, patientId],
    queryFn: () => apiRequest(`/api/appointments?${params}`, {}, accessToken ?? undefined),
    enabled,
  });
}

export function useCreateAppointment() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      patientId: string;
      dentistId?: string;
      type: string;
      startTime: string;
      endTime: string;
      notes?: string;
    }) => apiRequest('/api/appointments', { method: 'POST', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}

export function useUpdateAppointment(id: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { status?: string; notes?: string; cancelReason?: string }) =>
      apiRequest(`/api/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });
}
