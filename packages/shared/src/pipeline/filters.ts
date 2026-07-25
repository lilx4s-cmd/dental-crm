// Shared vocabulary for the pipeline filter bar. The API turns these into Prisma where-clauses and
// the UI turns them into chips, so both have to agree on what "this week" means — otherwise the
// board shows a different set than the chip claims.

/** How many days without a stage change before a lead counts as going nowhere. */
export const STUCK_LEAD_DAYS = 14;

export const TaskDueFilter = {
  OVERDUE: 'overdue',
  TODAY: 'today',
  WEEK: 'week',
  MONTH: 'month',
  NONE: 'none',
} as const;
export type TaskDueFilter = (typeof TaskDueFilter)[keyof typeof TaskDueFilter];

export const TASK_DUE_LABELS: Record<TaskDueFilter, string> = {
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  month: 'This month',
  none: 'No task',
};

/** Every field the filter bar can filter on. Drives the "Add field" picker and the chip labels. */
export const PIPELINE_FILTER_FIELDS = [
  { key: 'search', label: 'Patient', hint: 'Name, email or phone' },
  { key: 'assignedToId', label: 'Responsible person' },
  { key: 'stage', label: 'Stage' },
  { key: 'taskDue', label: 'Task due' },
  { key: 'source', label: 'Source' },
  { key: 'stuck', label: 'No movement' },
] as const;

export type PipelineFilterKey = (typeof PIPELINE_FILTER_FIELDS)[number]['key'];

/** Which fields the filter form shows before anyone customises it. */
export const DEFAULT_PIPELINE_FILTER_FIELDS: PipelineFilterKey[] = ['assignedToId', 'stage', 'taskDue'];

export interface DateRange {
  gte?: Date;
  lt?: Date;
}

/**
 * The window a task due-date filter covers, resolved against `now`.
 *
 * "This week" and "this month" run from *now* to the end of the period rather than from its start —
 * someone asking what is due this week wants what is still ahead of them, and anything already past
 * belongs under Overdue instead of being counted twice. Weeks end Sunday (ISO), which matches how
 * the clinic's rota reads.
 *
 * `overdue` and `none` have no range; callers handle those as separate cases.
 */
export function taskDueRange(filter: TaskDueFilter, now: Date = new Date()): DateRange | null {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case 'today': {
      const tomorrow = new Date(startOfToday);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { gte: startOfToday, lt: tomorrow };
    }
    case 'week': {
      // Days remaining until the coming Sunday inclusive; getDay() is 0 for Sunday.
      const daysToSunday = (7 - now.getDay()) % 7;
      const endOfWeek = new Date(startOfToday);
      endOfWeek.setDate(endOfWeek.getDate() + daysToSunday + 1);
      return { gte: startOfToday, lt: endOfWeek };
    }
    case 'month': {
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { gte: startOfToday, lt: endOfMonth };
    }
    case 'overdue':
      return { lt: startOfToday };
    case 'none':
      return null;
  }
}

/** The cutoff a lead's stageChangedAt must precede to count as stuck. */
export function stuckBefore(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - STUCK_LEAD_DAYS);
  return cutoff;
}
