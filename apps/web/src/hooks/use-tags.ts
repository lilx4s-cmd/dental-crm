import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TagCategory, TagColor } from '@dental-crm/shared';

import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface Tag {
  id: string;
  name: string;
  color: TagColor;
  category: TagCategory;
  createdAt: string;
  /** Deals plus patients carrying it. Shown next to the delete button, not discovered after. */
  usageCount: number;
}

/** What a card or a deal sheet gets: the label itself, without the administrative fields. */
export interface TagRef {
  id: string;
  name: string;
  color: TagColor;
  category: TagCategory;
}

/**
 * The whole vocabulary.
 *
 * Long-lived in the cache and shared by the picker, the filter bar, the deal sheet and the patient
 * record. Tags change a few times a month at most, and re-fetching the list every time a picker
 * opens makes it flicker on a slow connection for no benefit.
 */
export function useTags() {
  const { accessToken } = useAuth();
  return useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: () => apiRequest('/api/tags', {}, accessToken ?? undefined),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateTag() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<Tag, Error, { name: string; color?: TagColor; category?: TagCategory }>({
    mutationFn: (body) =>
      apiRequest('/api/tags', { method: 'POST', body: JSON.stringify(body) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });
}

export function useUpdateTag() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<
    Tag,
    Error,
    { id: string; name?: string; color?: TagColor; category?: TagCategory }
  >({
    mutationFn: ({ id, ...body }) =>
      apiRequest(`/api/tags/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      // A rename changes the label on every card and every patient row that carries it.
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

export function useDeleteTag() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiRequest(`/api/tags/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

// ─────────────────────────── TAGS ON DEALS ───────────────────────────

/**
 * Add or remove tags across a selection.
 *
 * One hook for both directions, matching the endpoint. `remove` is the flag rather than a separate
 * hook because the two share every piece of behaviour that matters — scoping, the per-deal cap,
 * and the history entry.
 */
export function useBulkTagLeads() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<
    { changed: number; leads: number; action: 'ADDED' | 'REMOVED'; requested: number },
    Error,
    { leadIds: string[]; tagIds: string[]; remove?: boolean }
  >({
    mutationFn: (body) =>
      apiRequest('/api/leads/bulk/tags', { method: 'POST', body: JSON.stringify(body) }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      // Usage counts move with every tagging.
      qc.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

/** One tag on one deal. Used by the deal sheet, where the unit of work is a single card. */
export function useToggleLeadTag() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<unknown, Error, { leadId: string; tagId: string; remove?: boolean }>({
    mutationFn: ({ leadId, tagId, remove }) =>
      apiRequest(
        `/api/leads/${leadId}/tags/${tagId}`,
        { method: remove ? 'DELETE' : 'POST' },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-tag-history'] });
      qc.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export interface LeadTagHistoryEntry {
  id: string;
  tagName: string;
  action: 'ADDED' | 'REMOVED';
  createdAt: string;
  tag: { id: string; color: TagColor; category: TagCategory } | null;
  user: { id: string; firstName: string; lastName: string } | null;
}

/**
 * When each tag went on this deal and when it came off.
 *
 * Only fetched when the deal sheet's history is open — it is a hundred rows nobody reads on the
 * common path, and the board already carries the tags themselves.
 */
export function useLeadTagHistory(leadId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<LeadTagHistoryEntry[]>({
    queryKey: ['lead-tag-history', leadId],
    queryFn: () => apiRequest(`/api/leads/${leadId}/tags/history`, {}, accessToken ?? undefined),
    enabled: !!leadId,
  });
}
