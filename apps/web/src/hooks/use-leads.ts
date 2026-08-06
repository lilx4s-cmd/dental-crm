import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DuplicateGroup, MergeDuplicatesResult, TaskDueFilter } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { apiRequest, apiRequestDownload, saveBlob } from '@/lib/api-client';
import type { TagRef } from './use-tags';

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
  /**
   * ISO 3166-1 alpha-2. Not merely descriptive: a leading zero on a phone number is a national
   * trunk prefix, so this decides whether 055 512 3456 dials Riyadh or Istanbul.
   */
  country: string | null;
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
  /** In the order they were applied. On every card — see LEAD_SELECT. */
  tags: { tag: TagRef }[];
  /**
   * The most recent history entry, as a one-element array. Zero or one.
   *
   * `stageChangedAt` only knows about stage moves, so a deal somebody called twice yesterday and
   * left in Contacted reads as neglected, while one dragged across the board by a tidy-up reads as
   * worked. This is what tells those apart.
   */
  activities?: { id: string; note: string | null; toStage: string | null; createdAt: string }[];
  /** The thread that spoke most recently, with its last message. Zero or one of each. */
  conversations?: {
    id: string;
    lastMessageAt: string | null;
    messages: { id: string; direction: 'INBOUND' | 'OUTBOUND'; content: string | null; createdAt: string }[];
  }[];
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
  /** Deals carrying *all* of these. See LeadsQueryDto for why AND rather than OR. */
  tagIds?: string[];
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
    if (value === undefined || value === '' || value === false) continue;
    // Repeated rather than comma-joined: `String(['a','b'])` is "a,b", which the API parses as one
    // malformed uuid and rejects the whole request. `append` produces `?tagIds=a&tagIds=b`, which
    // is what its @Transform expects.
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else params.set(key, String(value));
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
  /** ISO 3166-1 alpha-2 — decides how a local-format phone number is read. */
  country?: string;
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

// ─────────────────────────── BULK ACTIONS ───────────────────────────
// Everything the board's selection toolbar can do. Each takes explicit ids, never a filter — see
// BulkLeadIdsDto on the API side for why.
//
// All four invalidate ['leads'] because every one of them can change what the board shows:
// archiving removes cards, a note changes the last-activity line, and a delete removes the row.

export interface BulkResult {
  /** How many ids the request carried. Compare with the acted-on count to spot a scoped-away id. */
  requested: number;
}

export function useBulkArchiveLeads() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<
    BulkResult & { archived: boolean; changed: number },
    Error,
    { leadIds: string[]; archived?: boolean }
  >({
    mutationFn: (payload) =>
      apiRequest('/api/leads/bulk/archive', { method: 'POST', body: JSON.stringify(payload) }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['sales-activity'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useBulkNoteLeads() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<BulkResult & { noted: number }, Error, { leadIds: string[]; note: string }>({
    mutationFn: (payload) =>
      apiRequest('/api/leads/bulk/note', { method: 'POST', body: JSON.stringify(payload) }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-activities'] });
      qc.invalidateQueries({ queryKey: ['sales-activity'] });
    },
  });
}

export function useBulkDeleteLeads() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<BulkResult & { deleted: number }, Error, { leadIds: string[] }>({
    mutationFn: ({ leadIds }) =>
      apiRequest(
        '/api/leads/bulk',
        // `confirm` is set here rather than left to each call site: the flag exists so a malformed
        // or replayed request cannot delete by omission, and that guarantee is worth nothing if
        // half the callers forget it.
        { method: 'DELETE', body: JSON.stringify({ leadIds, confirm: true }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['sales-activity'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/**
 * Downloads the selection as a CSV.
 *
 * A mutation rather than a query: it is a POST that changes nothing here but writes an audit row
 * there, and caching a download by its selection would mean the second export of a changed
 * pipeline silently returns the first one.
 */
export function useExportLeads() {
  const { accessToken } = useAuth();
  return useMutation<{ count: number | null }, Error, { leadIds: string[] }>({
    mutationFn: async (payload) => {
      const { blob, filename, count } = await apiRequestDownload(
        '/api/leads/bulk/export',
        { method: 'POST', body: JSON.stringify(payload) },
        accessToken ?? undefined,
      );
      saveBlob(blob, filename ?? 'deals.csv');
      return { count };
    },
  });
}

/**
 * One reminder against every selected deal.
 *
 * Defaults each task to the deal's own assignee rather than to whoever clicked — see bulkTask on
 * the API side. Invalidates the work list as well as the board, because a reminder due today
 * changes what "my day" shows the moment it is created.
 */
export function useBulkTaskLeads() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<
    BulkResult & { created: number; unassigned: number },
    Error,
    { leadIds: string[]; title: string; dueDate: string; assignedToId?: string }
  >({
    mutationFn: (payload) =>
      apiRequest('/api/leads/bulk/tasks', { method: 'POST', body: JSON.stringify(payload) }, accessToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead-tasks'] });
      qc.invalidateQueries({ queryKey: ['work-list'] });
    },
  });
}

/**
 * Stage changes, notes, tag changes and messages, on one timeline.
 *
 * Separate from `useLeadActivities`, which the sales feed still reads and which must keep meaning
 * "stage changes only". The question people bring to a deal spans both — "we sent the offer on
 * Tuesday, did they ever reply?" — and until this existed the answer lived on two screens.
 */
export interface TimelineEntry {
  kind: 'activity' | 'message' | 'tag';
  id: string;
  at: string;
  user: { id: string; firstName: string; lastName: string } | null;
  note?: string | null;
  fromStage?: string | null;
  toStage?: string | null;
  direction?: 'INBOUND' | 'OUTBOUND';
  content?: string | null;
  hasMedia?: boolean;
  status?: string;
  conversationId?: string;
  tagName?: string;
  action?: 'ADDED' | 'REMOVED';
}

export function useLeadTimeline(leadId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<TimelineEntry[]>({
    queryKey: ['lead-timeline', leadId],
    queryFn: () => apiRequest(`/api/leads/${leadId}/timeline`, {}, accessToken ?? undefined),
    enabled: !!leadId,
  });
}
