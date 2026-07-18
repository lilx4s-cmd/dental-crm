import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface ConversationSummary {
  id: string;
  channel: string;
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
  createdAt: string;
  senderUser: { id: string; firstName: string; lastName: string } | null;
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

export function useArchiveConversation() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/conversations/${id}/archive`, { method: 'PATCH' }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}
