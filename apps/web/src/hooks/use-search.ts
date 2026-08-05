import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface SearchHit {
  type: 'lead' | 'patient';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * Global search, for the command palette.
 *
 * Debounced by `staleTime` rather than a timer: the palette re-queries on every keystroke, and a
 * cached result for a prefix the user has already typed is exactly what they see while typing the
 * next character. Two characters is the floor — one matches most of the database and costs a scan
 * to prove it.
 */
export function useGlobalSearch(term: string, enabled: boolean) {
  const { accessToken } = useAuth();
  const q = term.trim();

  return useQuery<SearchHit[]>({
    queryKey: ['search', q],
    queryFn: () => apiRequest(`/api/search?q=${encodeURIComponent(q)}`, {}, accessToken ?? undefined),
    enabled: enabled && q.length >= 2,
    staleTime: 30_000,
    // A search that finds nothing is an answer, not a failure worth retrying.
    retry: false,
  });
}
