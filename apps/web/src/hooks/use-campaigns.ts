import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface Campaign {
  id: string;
  name: string;
  platform: string;
  externalId: string | null;
  adAccountId: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budget: number | null;
  createdAt: string;
  updatedAt: string;
  _count: { leads: number };
}

export function useCampaigns() {
  const { accessToken } = useAuth();
  return useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: () => apiRequest('/api/campaigns', {}, accessToken ?? undefined),
  });
}

export function useCreateCampaign() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Campaign>) =>
      apiRequest('/api/campaigns', { method: 'POST', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}
