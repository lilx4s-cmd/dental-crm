import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DuplicateGroup, MergeDuplicatesResult, TaskDueFilter } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface LeadTask {
  id: string;
  title: string;
  dueDate: string;
  completedAt: string | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
}

/** What a patient declared on the public enquiry form. Present only on the single-lead view. */
export interface LeadIntakeSubmission {
  id: string;
  createdAt: string;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  countryOfResidence: string | null;
  /** ISO 3166-1 alpha-2. Needed to read a local-format phone number — see lib/whatsapp.ts. */
  country: string | null;
  preferredLanguage: string | null;
  treatmentInterest: string[];
  chiefComplaint: string | null;
  desiredTimeframe: string | null;
  openToTravel: boolean | null;
  allergies: string | null;
  medications: string | null;
  medicalConditions: string | null;
  previousSurgeries: string | null;
  isSmoker: boolean | null;
  drinksAlcohol: boolean | null;
  isPregnant: boolean | null;
  takesBloodThinners: boolean | null;
  heightCm: number | null;
  weightKg: number | null;
  additionalNotes: string | null;
  consentedAt: string;
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
}

export interface Lead {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  source: string;
  stage: string;
  status: string;
  estimatedValue: number | null;
  currency: string;
  lostReason: string | null;
  notes: string | null;
  /** Original Bitrix24 deal ID, recovered for leads migrated from the clinic's old CRM. Null for leads created directly here. */
  bitrixDealId: number | null;
  createdAt: string;
  updatedAt: string;
  /** When the lead last moved stage — drives the "no movement" badge and filter. */
  stageChangedAt: string;
  assignedTo: { id: string; firstName: string; lastName: string; email: string } | null;
  /** Open tasks only, soonest due first. Completed ones are fetched per-lead on demand. */
  tasks: LeadTask[];
  campaign: { id: string; name: string; platform: string } | null;
  patient: { id: string; firstName: string; lastName: string } | null;
  /** Only returned by GET /leads/:id — the kanban deliberately omits it. */
  intakeSubmissions?: LeadIntakeSubmission[];
}

export interface PipelineGroup {
  stage: string;
  leads: Lead[];
}

export interface PipelineFilters {
  search?: string;
  stage?: string;
  assignedToId?: string;
  source?: string;
  taskDue?: TaskDueFilter;
  stuck?: boolean;
}

export interface LeadsQuery extends PipelineFilters {
  page?: number;
  limit?: number;
  status?: string;
  /** Set false to skip firing the query (e.g. while a dependent selection is empty). Defaults to true. */
  enabled?: boolean;
}

export interface LeadsListResponse {
  data: Lead[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export function useLeadsByStage(filters: PipelineFilters = {}) {
  const { accessToken } = useAuth();
  const params = new URLSearchParams();
  // Empty strings would filter on "" rather than meaning "unset", so only real values go on the URL.
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== false) params.set(key, String(value));
  }
  const qs = params.toString();
  return useQuery<PipelineGroup[]>({
    // Filters are part of the key so switching them refetches instead of showing a stale board.
    queryKey: ['leads', 'by-stage', qs],
    queryFn: () => apiRequest(`/api/leads/by-stage${qs ? `?${qs}` : ''}`, {}, accessToken ?? undefined),
  });
}

export function useLeads(query: LeadsQuery = {}) {
  const { accessToken } = useAuth();
  const { enabled = true, ...rest } = query;
  const params = new URLSearchParams();
  if (rest.page) params.set('page', String(rest.page));
  if (rest.limit) params.set('limit', String(rest.limit));
  if (rest.search) params.set('search', rest.search);
  if (rest.stage) params.set('stage', rest.stage);
  if (rest.status) params.set('status', rest.status);
  if (rest.assignedToId) params.set('assignedToId', rest.assignedToId);

  return useQuery<LeadsListResponse>({
    queryKey: ['leads', rest],
    queryFn: () => apiRequest(`/api/leads?${params}`, {}, accessToken ?? undefined),
    enabled: enabled && !!accessToken,
  });
}

export function useLead(id: string) {
  const { accessToken } = useAuth();
  return useQuery<Lead>({
    queryKey: ['leads', id],
    queryFn: () => apiRequest(`/api/leads/${id}`, {}, accessToken ?? undefined),
    enabled: !!id,
  });
}

// Partial<Lead> was a loose fit for creation (Lead includes server-assigned
// fields like id/stage/assignedTo-as-object) — this is the actual create payload.
export interface CreateLeadPayload {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  source: string;
  campaignId?: string;
  estimatedValue?: number;
  currency?: string;
  notes?: string;
  /** Defaults to the creating user on the backend when omitted. */
  assignedToId?: string;
}

export function useCreateLead() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateLeadPayload) =>
      apiRequest<Lead>('/api/leads', { method: 'POST', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ─── CSV import ───────────────────────────────────────────────────────────────

/** One mapped spreadsheet row, matching the API's ImportedLeadDto. */
export interface ImportedLeadRow {
  firstName: string;
  lastName?: string;
  phone?: string;
  whatsappNumber?: string;
  email?: string;
  source?: string;
  estimatedValue?: number;
  currency?: string;
  notes?: string;
}

export interface ImportLeadsPayload {
  leads: ImportedLeadRow[];
  assignedToId?: string;
  skipDuplicates?: boolean;
}

export interface ImportLeadsResult {
  created: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

export function useImportLeads() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<ImportLeadsResult, Error, ImportLeadsPayload>({
    mutationFn: (payload) =>
      apiRequest('/api/leads/import', { method: 'POST', body: JSON.stringify(payload) }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ─── Duplicate numbers ────────────────────────────────────────────────────────

export interface MergeDuplicatesPayload {
  dryRun?: boolean;
  numbers?: string[];
  survivors?: Record<string, string>;
  includeRepeatTreatment?: boolean;
}

export function useDuplicateGroups(enabled: boolean) {
  const { accessToken } = useAuth();
  return useQuery<DuplicateGroup[]>({
    queryKey: ['leads', 'duplicates'],
    queryFn: () => apiRequest('/api/leads/duplicates', {}, accessToken ?? undefined),
    // Scans every lead, so it runs when the panel is actually open rather than on every board load.
    enabled: enabled && !!accessToken,
    staleTime: 60_000,
  });
}

export function useMergeDuplicates() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<MergeDuplicatesResult, Error, MergeDuplicatesPayload>({
    mutationFn: (payload) =>
      apiRequest('/api/leads/duplicates/merge', { method: 'POST', body: JSON.stringify(payload) }, accessToken ?? undefined),
    onSuccess: (result) => {
      // A dry run changed nothing, so refetching the board would only churn.
      if (result.dryRun) return;
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateLeadStage() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage, note, lostReason }: { id: string; stage: string; note?: string; lostReason?: string }) =>
      apiRequest(
        `/api/leads/${id}/stage`,
        { method: 'PATCH', body: JSON.stringify({ stage, note, lostReason }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ─── Per-lead stage/activity history, shown in the pipeline detail sheet ──────

export interface LeadActivityItem {
  id: string;
  leadId: string;
  userId: string | null;
  fromStage: string | null;
  toStage: string | null;
  note: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string } | null;
}

export function useLeadActivities(id: string | null) {
  const { accessToken } = useAuth();
  return useQuery<LeadActivityItem[]>({
    queryKey: ['leads', id, 'activities'],
    queryFn: () => apiRequest(`/api/leads/${id}/activities`, {}, accessToken ?? undefined),
    enabled: !!id,
  });
}

export function useConvertLeadToPatient() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/leads/${id}/convert`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ─── Sales team: transfer + activity history ──────────────────────────────────

export interface TransferPayload {
  toUserId: string;
  fromUserId?: string;
  leadIds?: string[];
  note?: string;
  // The same filters the pipeline board uses. The server resolves them through the same
  // where-builder, so "transfer what I filtered" moves exactly the set that was on screen rather
  // than a second interpretation of the same words.
  stage?: string;
  source?: string;
  taskDue?: TaskDueFilter;
  stuck?: boolean;
  search?: string;
}

export interface TransferResult {
  transferred: number;
  toUserId: string;
}

export interface TransferPreviewLead {
  id: string;
  firstName: string;
  lastName: string | null;
  stage: string;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
}

/**
 * Shows exactly which leads a transfer would move, before it moves them. Bulk reassignment is hard
 * to undo by hand, so the set is confirmed rather than described.
 */
export function useTransferPreview(payload: TransferPayload, enabled: boolean) {
  const { accessToken } = useAuth();
  return useQuery<{ leads: TransferPreviewLead[]; total: number; showing: number }>({
    queryKey: ['transfer-preview', payload],
    queryFn: () =>
      apiRequest('/api/leads/transfer/preview', { method: 'POST', body: JSON.stringify(payload) }, accessToken ?? undefined),
    enabled,
    retry: false,
  });
}

export function useTransferLeads() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<TransferResult, Error, TransferPayload>({
    mutationFn: (payload) =>
      apiRequest('/api/leads/transfer', { method: 'POST', body: JSON.stringify(payload) }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['sales-activity'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export interface SalesActivity {
  id: string;
  leadId: string;
  userId: string | null;
  fromStage: string | null;
  toStage: string | null;
  note: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
  lead: { id: string; firstName: string; lastName: string | null; stage: string; status: string } | null;
}

export interface SalesActivityResponse {
  data: SalesActivity[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export function useSalesActivity(query: { page?: number; limit?: number; userId?: string } = {}) {
  const { accessToken } = useAuth();
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.limit) params.set('limit', String(query.limit));
  if (query.userId) params.set('userId', query.userId);

  return useQuery<SalesActivityResponse>({
    queryKey: ['sales-activity', query],
    queryFn: () => apiRequest(`/api/leads/activity?${params}`, {}, accessToken ?? undefined),
  });
}

// ─────────────────────────── LEAD TASKS ───────────────────────────
// Every mutation invalidates ['leads'], which covers both the kanban and the list: completing a
// task can move a lead in or out of a due-date filter, so the board has to re-read.

/** Full task history for one lead, open first. The board payload carries open tasks only. */
export function useLeadTasks(leadId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<LeadTask[]>({
    queryKey: ['lead-tasks', leadId],
    queryFn: () => apiRequest(`/api/leads/${leadId}/tasks`, {}, accessToken ?? undefined),
    enabled: !!leadId,
  });
}

export interface CreateLeadTaskInput {
  title: string;
  dueDate: string;
  assignedToId?: string;
}

export function useCreateLeadTask() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, ...data }: CreateLeadTaskInput & { leadId: string }) =>
      apiRequest(
        `/api/leads/${leadId}/tasks`,
        { method: 'POST', body: JSON.stringify(data) },
        accessToken ?? undefined,
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-tasks', vars.leadId] });
    },
  });
}

export function useUpdateLeadTask() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      ...data
    }: {
      taskId: string;
      leadId?: string;
      title?: string;
      dueDate?: string;
      assignedToId?: string;
      completed?: boolean;
    }) =>
      apiRequest(
        `/api/leads/tasks/${taskId}`,
        { method: 'PATCH', body: JSON.stringify(data) },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-tasks'] });
    },
  });
}

export function useDeleteLeadTask() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      apiRequest(`/api/leads/tasks/${taskId}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-tasks'] });
    },
  });
}
