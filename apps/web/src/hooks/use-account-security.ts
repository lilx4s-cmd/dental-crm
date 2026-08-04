import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface OwnSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  createdByIp: string | null;
  userAgent: string | null;
  /** The browser making the request. Marked rather than hidden, so the list stays complete. */
  current: boolean;
}

export interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesRemaining: number;
}

export function useOwnSessions() {
  const { accessToken } = useAuth();
  return useQuery<OwnSession[]>({
    queryKey: ['auth', 'sessions'],
    queryFn: () => apiRequest('/api/auth/sessions', {}, accessToken ?? undefined),
    enabled: !!accessToken,
  });
}

export function useTwoFactorStatus() {
  const { accessToken } = useAuth();
  return useQuery<TwoFactorStatus>({
    queryKey: ['auth', '2fa'],
    queryFn: () => apiRequest('/api/auth/2fa/status', {}, accessToken ?? undefined),
    enabled: !!accessToken,
  });
}

function usePost<TBody, TResult = void>(path: string, invalidate: string[][] = []) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<TResult, Error, TBody>({
    mutationFn: (body) =>
      apiRequest<TResult>(
        path,
        { method: 'POST', body: JSON.stringify(body ?? {}) },
        accessToken ?? undefined,
      ),
    onSuccess: () => invalidate.forEach((key) => qc.invalidateQueries({ queryKey: key })),
  });
}

export function useChangeOwnPassword() {
  // Every session is revoked server-side, so the session list is stale the moment this succeeds.
  return usePost<{ currentPassword: string; newPassword: string }>('/api/auth/change-password', [
    ['auth', 'sessions'],
  ]);
}

export function useBeginTwoFactor() {
  return usePost<void, { secret: string; qrDataUrl: string }>('/api/auth/2fa/setup');
}

export function useConfirmTwoFactor() {
  return usePost<{ code: string }, { recoveryCodes: string[] }>('/api/auth/2fa/confirm', [
    ['auth', '2fa'],
  ]);
}

export function useDisableTwoFactor() {
  return usePost<{ currentPassword: string }>('/api/auth/2fa/disable', [['auth', '2fa']]);
}

export function useRevokeOwnSession() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiRequest(`/api/auth/sessions/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });
}
