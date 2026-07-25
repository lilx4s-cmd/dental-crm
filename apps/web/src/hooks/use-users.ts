import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  calendarColor: string | null;
  specialization: string | null;
}

export function useUsers() {
  const { accessToken } = useAuth();
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiRequest('/api/users', {}, accessToken ?? undefined),
  });
}

export function useDentists() {
  const { data: users, ...rest } = useUsers();
  return { data: users?.filter((u) => u.role === 'DENTIST' && u.isActive), ...rest };
}

// Treatment coordinators reuse the SALES_CONSULTANT role (confirmed product decision:
// no dedicated TREATMENT_COORDINATOR role). Mirrors useDentists().
export function useCoordinators() {
  const { data: users, ...rest } = useUsers();
  return { data: users?.filter((u) => u.role === 'SALES_CONSULTANT' && u.isActive), ...rest };
}

// ─── Access control (Super Admin / Clinic Manager) ───────────────────────────

function useUserMutation<TVars>(fn: (vars: TVars, token?: string) => Promise<unknown>) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => fn(vars, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

/** Live sessions for one user, so an admin can see whether anyone is actually signed in. */
export function useUserSessions(userId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<{ active: number }>({
    queryKey: ['user-sessions', userId],
    queryFn: () => apiRequest(`/api/users/${userId}/sessions`, {}, accessToken ?? undefined),
    enabled: !!userId,
  });
}

export function useUpdateUser() {
  return useUserMutation<{ id: string; email?: string; firstName?: string; lastName?: string; role?: string }>(
    ({ id, ...data }, token) =>
      apiRequest(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  );
}

/** Sets a new password and ends the user's sessions — a reset that leaves them logged in has not
 *  actually taken access away. */
export function useResetUserPassword() {
  return useUserMutation<{ id: string; newPassword: string }>(({ id, newPassword }, token) =>
    apiRequest(
      `/api/users/${id}/reset-password`,
      { method: 'POST', body: JSON.stringify({ newPassword }) },
      token,
    ),
  );
}

export function useRevokeUserSessions() {
  return useUserMutation<string>((id, token) =>
    apiRequest(`/api/users/${id}/revoke-sessions`, { method: 'POST' }, token),
  );
}

export function useSetUserActive() {
  return useUserMutation<{ id: string; active: boolean }>(({ id, active }, token) =>
    active
      ? apiRequest(`/api/users/${id}/activate`, { method: 'PATCH' }, token)
      : apiRequest(`/api/users/${id}`, { method: 'DELETE' }, token),
  );
}
