import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface ConversationSummary {
  /** Inbound messages since staff last opened this thread. */
  unreadCount: number;
  id: string;
  channel: string;
  externalThreadId: string | null;
  isArchived: boolean;
  lastMessageAt: string | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string; phone: string | null } | null;
  lead: { id: string; firstName: string; lastName: string; phone: string | null; stage: string } | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  messages: { content: string | null; direction: string; createdAt: string }[];
}

export interface Message {
  id: string;
  direction: string;
  content: string | null;
  mediaUrl: string | null;
  status: string;
  /** Why a send failed. Present only on FAILED messages. */
  failureReason: string | null;
  createdAt: string;
  sentAt: string | null;
  senderUser: { id: string; firstName: string; lastName: string } | null;
}

export interface SendingStatus {
  transport: 'evolution' | 'cloud_api' | 'web' | 'none';
  label: string;
  canSend: boolean;
}

export interface ConversationDetail extends Omit<ConversationSummary, 'messages'> {
  messages: Message[];
}

export function useConversations(channel?: string) {
  const { accessToken } = useAuth();
  const params = new URLSearchParams();
  if (channel) params.set('channel', channel);

  return useQuery<ConversationSummary[]>({
    queryKey: ['conversations', channel],
    queryFn: () => apiRequest(`/api/conversations?${params}`, {}, accessToken ?? undefined),
    refetchInterval: 10_000,
  });
}

export function useConversation(id: string) {
  const { accessToken } = useAuth();
  return useQuery<ConversationDetail>({
    queryKey: ['conversations', id],
    queryFn: () => apiRequest(`/api/conversations/${id}`, {}, accessToken ?? undefined),
    enabled: !!id,
    refetchInterval: 5_000,
  });
}

export function useSendMessage(conversationId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiRequest(
        `/api/conversations/${conversationId}/messages`,
        { method: 'POST', body: JSON.stringify({ content }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations', conversationId] }),
  });
}

/**
 * Whether a reply typed right now would actually reach the patient.
 *
 * Worth asking before they type rather than after: discovering the gateway is down from a failed
 * message means the coordinator has already composed it.
 */
export function useSendingStatus() {
  const { accessToken } = useAuth();
  return useQuery<SendingStatus>({
    queryKey: ['conversations', 'sending-status'],
    queryFn: () => apiRequest('/api/conversations/sending-status', {}, accessToken ?? undefined),
    staleTime: 60_000,
  });
}

export function useRetryMessage(conversationId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) =>
      apiRequest(
        `/api/conversations/${conversationId}/messages/${messageId}/retry`,
        { method: 'POST' },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations', conversationId] }),
  });
}

/** Opens (or reuses) a WhatsApp thread with a lead or patient who has not written in yet. */
export function useStartConversation() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<ConversationSummary, Error, { leadId?: string; patientId?: string }>({
    mutationFn: (body) =>
      apiRequest(
        '/api/conversations/start',
        { method: 'POST', body: JSON.stringify(body) },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

/**
 * Threads waiting on a reply, for the navigation badge.
 *
 * Polled rather than pushed: there is no websocket in this app, and a badge that is up to a minute
 * stale is still the difference between knowing six people are waiting and not knowing at all.
 * `refetchOnWindowFocus` covers the common case — coming back to the tab shows the current number
 * immediately rather than up to a minute later.
 */
export function useUnreadSummary() {
  const { accessToken } = useAuth();
  return useQuery<{ conversations: number; messages: number }>({
    queryKey: ['conversations', 'unread'],
    queryFn: () => apiRequest('/api/conversations/unread', {}, accessToken ?? undefined),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    // A badge is not worth an error state; absent is the right failure.
    retry: false,
  });
}

/** Marks a thread read when it is opened, and refreshes the badge. */
export function useMarkConversationRead() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/conversations/${id}/read`, { method: 'PATCH' }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useArchiveConversation() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/conversations/${id}/archive`, { method: 'PATCH' }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}
