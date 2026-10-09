import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import type { PatientTreatmentStatus, PatientView } from '@dental-crm/shared';
import type { TagRef } from './use-tags';

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  nationalId: string | null;
  notes: string | null;
  /**
   * The medical history a clinician plans treatment from.
   *
   * Null throughout means "nobody asked", never "no". The string fields hold "None" when the
   * question was put and the answer was negative; the booleans are nullable for the same reason,
   * so an unanswered question is never stored as a false.
   */
  allergies: string | null;
  medications: string | null;
  medicalConditions: string | null;
  previousSurgeries: string | null;
  takesBloodThinners: boolean | null;
  isPregnant: boolean | null;
  isSmoker: boolean | null;
  diagnosis: string | null;
  insuranceInfo: string | null;
  isActive: boolean;
  treatmentStatus?: PatientTreatmentStatus;
  treatmentFinishedAt?: string | null;
  convertedFromLead?: {
    assignedTo: { id: string; firstName: string; lastName: string } | null;
  } | null;
  appointments?: { id: string; startTime: string; endTime: string; type: string }[];
  travelBookings?: {
    id: string;
    visit: number;
    status: string;
    arrivalAt: string | null;
    departureAt: string | null;
  }[];
  convertedFromLeadId: string | null;
  createdAt: string;
  updatedAt: string;
  tags: { tag: TagRef }[];
}

export interface PatientsResponse {
  data: Patient[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface PatientsQuery {
  page?: number;
  limit?: number;
  search?: string;
  tagId?: string;
  view?: PatientView;
  month?: string;
  staffId?: string;
  dueDays?: number;
}

export function usePatients(query: PatientsQuery = {}) {
  const { accessToken } = useAuth();
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.search) params.set('search', query.search);
  if (query.tagId) params.set('tagId', query.tagId);
  if (query.view) params.set('view', query.view);
  if (query.month) params.set('month', query.month);
  if (query.staffId) params.set('staffId', query.staffId);
  if (query.dueDays) params.set('dueDays', String(query.dueDays));

  return useQuery<PatientsResponse>({
    queryKey: ['patients', query],
    refetchInterval: 60000,
    queryFn: () => apiRequest(`/api/patients?${params}`, {}, accessToken ?? undefined),
  });
}

/**
 * One patient's clinical record.
 *
 * `enabled` lets a caller who knows the current role cannot read clinical records skip the request
 * instead of firing one it knows will be refused. A 403 in the console reads as a defect to
 * whoever finds it next, and this one is a policy decision rather than a failure.
 */
export function usePatient(id: string, enabled = true) {
  const { accessToken } = useAuth();
  return useQuery<Patient>({
    queryKey: ['patients', id],
    queryFn: () => apiRequest(`/api/patients/${id}`, {}, accessToken ?? undefined),
    enabled: enabled && !!id,
  });
}

export function useCreatePatient() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Patient>) =>
      apiRequest(
        '/api/patients',
        { method: 'POST', body: JSON.stringify(data) },
        accessToken ?? undefined,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }),
  });
}

export function useUpdatePatient(id: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Patient>) =>
      apiRequest(
        `/api/patients/${id}`,
        { method: 'PATCH', body: JSON.stringify(data) },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['patients', id] });
    },
  });
}

/**
 * What to do next with this patient, and what the record is missing.
 *
 * Fetched separately from the patient rather than folded into it: the checklist counts plans,
 * appointments, invoices, files and warranties, and a patient record that is only being read for a
 * phone number should not pay for eight counts.
 */
export interface PatientStep {
  id: string;
  label: string;
  why: string;
  severity: 'safety' | 'blocking' | 'admin';
  done: boolean;
  target?: 'overview' | 'medical' | 'plans' | 'appointments' | 'files' | 'finance';
}

export interface PatientGuidance {
  steps: PatientStep[];
  nextStep: PatientStep | null;
  outstanding: PatientStep[];
  counts: { safety: number; blocking: number; admin: number; done: number; total: number };
  completeness: number;
}

export function usePatientGuidance(patientId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<PatientGuidance>({
    queryKey: ['patient-guidance', patientId],
    queryFn: () => apiRequest(`/api/patients/${patientId}/guidance`, {}, accessToken ?? undefined),
    enabled: !!patientId,
  });
}

export interface PatientSummary {
  working: number;
  finished: number;
  total: number;
  reservations: number;
  months: { month: string; count: number }[];
  staffOptions: { id: string; firstName: string; lastName: string }[];
  timezone: string;
}
export function usePatientSummary(query: PatientsQuery = {}) {
  const { accessToken } = useAuth();
  const params = new URLSearchParams();
  for (const key of ['search', 'month', 'staffId', 'tagId', 'dueDays'] as const)
    if (query[key]) params.set(key, String(query[key]));
  return useQuery<PatientSummary>({
    queryKey: ['patients', 'summary', query],
    queryFn: () => apiRequest(`/api/patients/summary?${params}`, {}, accessToken ?? undefined),
    refetchInterval: 60000,
  });
}
export function useTreatmentStatus(id: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: PatientTreatmentStatus) =>
      apiRequest(
        `/api/patients/${id}/treatment-status`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}
