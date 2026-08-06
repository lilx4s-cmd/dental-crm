import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface MessageTemplate {
  id: string;
  title: string;
  body: string;
  category: string | null;
  isActive: boolean;
  /** How often it has been inserted. Sorts the picker, so the six that get used sit on top. */
  useCount: number;
  createdAt: string;
}

/**
 * The canned replies.
 *
 * Long-lived in the cache: a clinic edits these a few times a year, and re-fetching every time a
 * composer opens makes the list flicker for no benefit.
 */
export function useMessageTemplates(includeInactive = false) {
  const { accessToken } = useAuth();
  return useQuery<MessageTemplate[]>({
    queryKey: ['message-templates', includeInactive],
    queryFn: () =>
      apiRequest(
        `/api/message-templates${includeInactive ? '?includeInactive=true' : ''}`,
        {},
        accessToken ?? undefined,
      ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateMessageTemplate() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<MessageTemplate, Error, { title: string; body: string; category?: string }>({
    mutationFn: (body) =>
      apiRequest('/api/message-templates', { method: 'POST', body: JSON.stringify(body) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['message-templates'] }),
  });
}

export function useUpdateMessageTemplate() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<
    MessageTemplate,
    Error,
    { id: string; title?: string; body?: string; category?: string; isActive?: boolean }
  >({
    mutationFn: ({ id, ...body }) =>
      apiRequest(`/api/message-templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['message-templates'] }),
  });
}

/** Retires a template. The endpoint deactivates rather than deletes — see the service. */
export function useRetireMessageTemplate() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<MessageTemplate, Error, string>({
    mutationFn: (id) =>
      apiRequest(`/api/message-templates/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['message-templates'] }),
  });
}

/**
 * Fills a template in for one recipient.
 *
 * Server-side so the substitution rules live in one place and the clinic name comes from settings
 * rather than from whatever the browser happened to have cached. It also increments the use count,
 * which is why it is a mutation.
 */
export function useRenderMessageTemplate() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<
    { body: string },
    Error,
    { id: string; firstName?: string | null; lastName?: string | null }
  >({
    mutationFn: ({ id, firstName, lastName }) =>
      apiRequest(
        `/api/message-templates/${id}/render`,
        { method: 'POST', body: JSON.stringify({ firstName, lastName }) },
        accessToken ?? undefined,
      ),
    // The ordering shifts as counts change, so the picker should reflect that next time it opens.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['message-templates'] }),
  });
}
