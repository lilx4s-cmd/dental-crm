import { useQuery, useMutation } from '@tanstack/react-query';
import type { TimelineStep } from './use-treatment-plans';

// Bare API origin — matches lib/api-client.ts's NEXT_PUBLIC_API_URL convention. The portal is
// unauthenticated, so calls here use plain `fetch` directly rather than apiRequest() (which
// always attaches an Authorization header / refresh-token flow that has no meaning here).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface PortalWarranty {
  id: string;
  startDate: string;
  durationMonths: number;
  status: 'ACTIVE' | 'EXPIRED' | 'VOIDED' | 'CLAIMED';
  termsAndConditions: string;
  maintenanceRequirements: string | null;
  exclusions: string | null;
  annualCheckupRequired: boolean;
}

export interface PortalPlanItem {
  id: string;
  description: string;
  toothNumber: string | null;
  quantity: number;
  cost: number;
  material: string | null;
  brand: string | null;
  status: string;
  warranties: PortalWarranty[];
}

export interface PortalComment {
  id: string;
  authorType: 'STAFF' | 'PATIENT';
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface PortalPlan {
  id: string;
  title: string;
  status: string;
  totalCost: number;
  currency: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  doctorRecommendation: string | null;
  aiSummary: string | null;
  createdAt: string;
  patient: { firstName: string; lastName: string };
  items: PortalPlanItem[];
  timelineSteps: TimelineStep[];
  comments: PortalComment[];
}

export interface PortalClinicBranding {
  clinicName: string;
  logoUrl: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
}

export interface PortalResponse {
  plan: PortalPlan;
  clinic: PortalClinicBranding;
}

async function portalFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api/portal${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function usePortalPlan(token: string) {
  return useQuery<PortalResponse>({
    queryKey: ['portal-plan', token],
    queryFn: () => portalFetch(`/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function usePortalApprove(token: string) {
  return useMutation({
    mutationFn: () => portalFetch(`/${token}/approve`, { method: 'POST' }),
  });
}

export function usePortalReject(token: string) {
  return useMutation({
    mutationFn: (reason?: string) =>
      portalFetch(`/${token}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  });
}

export function usePortalAddComment(token: string) {
  return useMutation({
    mutationFn: (data: { body: string; authorName?: string }) =>
      portalFetch(`/${token}/comments`, { method: 'POST', body: JSON.stringify(data) }),
  });
}

export function portalPdfUrl(token: string) {
  return `${API_URL}/api/portal/${token}/pdf`;
}
