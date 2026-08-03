// Split out of reports/page.tsx alongside the chart components (P-2): both the appointment pie
// and the lead funnel bar fall back to PIE_PALETTE for stages/statuses with no dedicated color.
export const APPT_COLORS: Record<string, string> = {
  SCHEDULED: '#6366f1', CONFIRMED: '#3b82f6', IN_PROGRESS: '#f59e0b',
  COMPLETED: '#22c55e', CANCELLED: '#ef4444', NO_SHOW: '#f97316',
};
export const PIE_PALETTE = ['#6366f1', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
