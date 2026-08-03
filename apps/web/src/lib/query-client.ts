import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api-client';

/**
 * Retry only what retrying could fix.
 *
 * The old blanket `retry: 1` re-sent everything, including the answers that will never change:
 * a coordinator opening a screen their role doesn't cover waited for two round-trips to be told
 * no, and a 404 on a deleted patient did the same. Server faults and dropped connections do get a
 * second and third attempt, because those genuinely come back.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.isPermanent) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: shouldRetry,
      // Steady backoff rather than the default's fast first retry: when the API is restarting
      // after a deploy, three attempts inside a second all hit the same closed door.
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      // A write is not safe to repeat blindly — a retried "record payment" is a duplicate payment.
      retry: false,
    },
  },
});
