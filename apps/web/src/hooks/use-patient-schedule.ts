import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PatientCalendarEvent } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
export function usePatientSchedule(from: string, to: string) {
  const { accessToken } = useAuth();
  return useQuery<PatientCalendarEvent[]>({
    queryKey: ['patient-schedule', from, to],
    queryFn: () =>
      apiRequest(
        `/api/patient-schedule/calendar?${new URLSearchParams({ from, to })}`,
        {},
        accessToken ?? undefined,
      ),
    refetchInterval: 60000,
    enabled: !!accessToken,
  });
}
export interface StaffNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  path: string;
}
export function useStaffNotifications() {
  const { accessToken, user } = useAuth();
  return useQuery<{ unread: number; data: StaffNotification[] }>({
    queryKey: ['staff-notifications', user?.sub],
    queryFn: () => apiRequest('/api/staff-alerts/notifications', {}, accessToken ?? undefined),
    enabled: !!accessToken,
    refetchInterval: 30000,
  });
}
export function useReadNotification() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(
        `/api/staff-alerts/notifications/${id}/read`,
        { method: 'PATCH' },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-notifications'] });
    },
  });
}
