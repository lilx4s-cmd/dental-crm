import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

// Matches the exact message the backend's ServiceUnavailableException throws when
// config.xai.apiKey is unset (see apps/api/src/ai/ai.service.ts's ensureConfigured()).
const AI_NOT_CONFIGURED_MESSAGE = 'AI features are not configured';

export function isAiNotConfiguredError(err: unknown): boolean {
  return err instanceof Error && err.message === AI_NOT_CONFIGURED_MESSAGE;
}

export interface SuggestedItem {
  description: string;
  suggestedCategory?: string;
}

// Invalidates the treatment-plans query so the newly generated aiSummary shows up on the card.
export function useGenerateSummary(patientId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, language }: { planId: string; language?: string }) =>
      apiRequest<{ id: string; aiSummary: string }>(
        `/api/treatment-plans/${planId}/generate-summary`,
        { method: 'POST', body: JSON.stringify({ language }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['treatment-plans', patientId] }),
  });
}

export function useSuggestItems() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (data: { diagnosisText: string; categoryNames?: string[] }) =>
      apiRequest<SuggestedItem[]>(
        '/api/ai/suggest-items',
        { method: 'POST', body: JSON.stringify(data) },
        accessToken ?? undefined,
      ),
  });
}

export function useDraftWhatsAppMessage() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (data: { patientId?: string; treatmentPlanId?: string; context?: string }) =>
      apiRequest<{ message: string }>(
        '/api/ai/draft-whatsapp-message',
        { method: 'POST', body: JSON.stringify(data) },
        accessToken ?? undefined,
      ),
  });
}
