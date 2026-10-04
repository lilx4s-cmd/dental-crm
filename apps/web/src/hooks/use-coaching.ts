import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
export type CoachLead = { id:string;firstName:string;lastName:string|null;stage:string;temperature?:string };
export type CoachIssue = { id:string;leadId:string;ruleKey:string;severity:'RED'|'ORANGE'|'YELLOW';title:string;description:string;recommendedAction:string;actionPath:string|null;status:string;detectedAt:string;escalatedAt:string|null;lead?:CoachLead;assignedUser?:{ firstName:string;lastName:string }|null };
export function useCoaching<T>(path:string,enabled=true) {
  const { accessToken } = useAuth();
  return useQuery<T>({ queryKey:['coaching',path],queryFn:() => apiRequest(`/api/coaching/${path}`,{},accessToken ?? undefined),enabled:!!accessToken && enabled,refetchInterval:15_000 });
}
export function useCoachAction() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({ mutationFn:({ path,body,method='POST' }:{ path:string;body?:unknown;method?:string }) => apiRequest(`/api/coaching/${path}`,{ method,body:JSON.stringify(body ?? {}) },accessToken ?? undefined),onSuccess:() => {
    for (const key of ['coaching','leads','lead-timeline','lead-tasks','work-list','supervision']) qc.invalidateQueries({ queryKey:[key] });
  } });
}
