import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface TreatmentCategory {
  id: string;
  name: string;
}

export interface TreatmentPlanItem {
  id: string;
  description: string;
  toothNumber: string | null;
  quantity: number;
  cost: number;
  unitPrice: number | null;
  discount: number;
  material: string | null;
  brand: string | null;
  clinicalNotes: string | null;
  status: string;
  treatmentCategory: TreatmentCategory | null;
}

export interface TimelineStep {
  id: string;
  title: string;
  description: string | null;
  status: string;
  order: number;
  dueDate: string | null;
  completedAt: string | null;
}

export interface TreatmentPlanComment {
  id: string;
  authorType: 'STAFF' | 'PATIENT';
  authorName: string | null;
  body: string;
  createdAt: string;
  authorUser: { id: string; firstName: string; lastName: string } | null;
}

interface AssignedStaff {
  id: string;
  firstName: string;
  lastName: string;
  specialization?: string | null;
}

export interface TreatmentPlan {
  id: string;
  title: string;
  status: string;
  totalCost: number;
  currency: string;
  notes: string | null;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedAt: string | null;
  rejectionReason: string | null;
  doctorRecommendation: string | null;
  diagnosisSnapshot: string | null;
  aiSummary: string | null;
  assignedDentistId: string | null;
  assignedCoordinatorId: string | null;
  createdAt: string;
  updatedAt: string;
  patient: { id: string; firstName: string; lastName: string };
  createdBy: { id: string; firstName: string; lastName: string };
  assignedDentist: AssignedStaff | null;
  assignedCoordinator: AssignedStaff | null;
  items: TreatmentPlanItem[];
  timelineSteps: TimelineStep[];
  comments: TreatmentPlanComment[];
}

export interface CreateTreatmentPlanItemInput {
  description: string;
  quantity: number;
  cost: number;
  toothNumber?: string;
  treatmentCategoryId?: string;
  material?: string;
  brand?: string;
  unitPrice?: number;
  discount?: number;
  clinicalNotes?: string;
}

export interface CreateTreatmentPlanInput {
  patientId: string;
  title: string;
  notes?: string;
  currency?: string;
  assignedDentistId?: string;
  assignedCoordinatorId?: string;
  doctorRecommendation?: string;
  items?: CreateTreatmentPlanItemInput[];
}

// Any subset of the plan's editable fields; backs the general PATCH :id endpoint.
export interface UpdateTreatmentPlanInput {
  status?: string;
  approvalStatus?: string;
  rejectionReason?: string;
  assignedDentistId?: string;
  assignedCoordinatorId?: string;
  doctorRecommendation?: string;
  title?: string;
  notes?: string;
}

export function useTreatmentPlans(patientId: string) {
  const { accessToken } = useAuth();
  return useQuery<TreatmentPlan[]>({
    queryKey: ['treatment-plans', patientId],
    queryFn: () =>
      apiRequest(`/api/treatment-plans?patientId=${patientId}`, {}, accessToken ?? undefined),
    enabled: !!patientId,
  });
}

export function useTreatmentCategories() {
  const { accessToken } = useAuth();
  return useQuery<TreatmentCategory[]>({
    queryKey: ['treatment-categories'],
    queryFn: () => apiRequest('/api/treatment-plans/categories', {}, accessToken ?? undefined),
  });
}

export function useCreateTreatmentPlan() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTreatmentPlanInput) =>
      apiRequest('/api/treatment-plans', { method: 'POST', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['treatment-plans', vars.patientId] }),
  });
}

// General plan update — replaces the old status-only mutation. Backs PATCH :id so a single
// hook covers status advancement, approval decisions, and dentist/coordinator assignment.
export function useUpdateTreatmentPlan(patientId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateTreatmentPlanInput & { id: string }) =>
      apiRequest(
        `/api/treatment-plans/${id}`,
        { method: 'PATCH', body: JSON.stringify(data) },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['treatment-plans', patientId] }),
  });
}

export function useAddTreatmentPlanComment(patientId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      apiRequest(
        `/api/treatment-plans/${id}/comments`,
        { method: 'POST', body: JSON.stringify({ body }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['treatment-plans', patientId] }),
  });
}

// Issues (or reissues) a public share link for the portal. Returns the raw token once —
// the caller is responsible for copying `${origin}/portal/${token}` immediately.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for call-site symmetry with the other per-patient hooks
export function useCreateShareLink(patientId: string) {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (planId: string) =>
      apiRequest<{ token: string; id: string; createdAt: string }>(
        `/api/treatment-plans/${planId}/share-link`,
        { method: 'POST' },
        accessToken ?? undefined,
      ),
  });
}

// The PDF endpoint requires a Bearer token (the API only accepts refresh tokens via cookie,
// see jwt.strategy.ts), so a plain <a href> can't authenticate — fetch as a blob instead and
// trigger the browser's save dialog via a throwaway object URL.
export function useDownloadPlanPdf() {
  const { accessToken } = useAuth();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  // `portalToken` is the raw share-link token — only available in memory right after
  // useCreateShareLink resolves (it's never persisted, only its hash is). If the caller
  // doesn't have one on hand, we still download the PDF; it just won't have a QR code.
  return async (planId: string, fileName = `treatment-plan-${planId}.pdf`, portalToken?: string) => {
    const query = portalToken ? `?portalToken=${encodeURIComponent(portalToken)}` : '';
    const res = await fetch(`${apiUrl}/api/treatment-plans/${planId}/pdf${query}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to download PDF');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  };
}

export function useUpdateTimelineStep(patientId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, stepId, ...data }: { planId: string; stepId: string; status?: string; title?: string; description?: string }) =>
      apiRequest(
        `/api/treatment-plans/${planId}/timeline-steps/${stepId}`,
        { method: 'PATCH', body: JSON.stringify(data) },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['treatment-plans', patientId] }),
  });
}
