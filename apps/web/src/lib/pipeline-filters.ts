import { LeadSource, LeadStatus, PIPELINE_STAGES, TaskDueFilter } from '@dental-crm/shared';
import type { PipelineFilters } from '@/hooks/use-leads';

/** Dashboard links and bookmarked boards use the same applied filters. */
export function pipelineFiltersFromSearch(params: Pick<URLSearchParams, 'get' | 'getAll'>): PipelineFilters {
  const filters: PipelineFilters = {};
  const stage = params.get('stage');
  if (stage && PIPELINE_STAGES.some(item => item.id === stage)) filters.stage = stage;
  const status = params.get('status');
  if (status && [...Object.values(LeadStatus), 'ALL'].includes(status)) filters.status = status;
  const source = params.get('source');
  if (source && Object.values(LeadSource).includes(source as LeadSource)) filters.source = source;
  const due = params.get('taskDue');
  if (due && Object.values(TaskDueFilter).includes(due as TaskDueFilter)) filters.taskDue = due as TaskDueFilter;
  for (const key of ['search', 'assignedToId'] as const) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  for (const key of ['createdFrom', 'createdBefore'] as const) {
    const value = params.get(key);
    if (value && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))) filters[key] = value;
  }
  if (params.get('stuck') === 'true' || params.get('stuck') === '1') filters.stuck = true;
  const tags = params.getAll('tagIds').filter(id => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id));
  if (tags.length) filters.tagIds = tags;
  return filters;
}

export function pipelineFilterParams(filters: PipelineFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '' || value === false) continue;
    if (Array.isArray(value)) value.forEach(item => params.append(key, item));
    else params.set(key, String(value));
  }
  return params;
}
