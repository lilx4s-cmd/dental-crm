'use client';

import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadTask } from '@/hooks/use-leads';

/**
 * How a task's due date reads at a glance. The three states are deliberately the only ones: a card
 * has to be scannable across a nine-column board, so anything finer than "late / now / later" is
 * noise at that size.
 */
export function taskUrgency(dueDate: string, now: Date = new Date()): 'overdue' | 'today' | 'upcoming' {
  const due = new Date(dueDate);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  if (due < startOfToday) return 'overdue';
  if (due < startOfTomorrow) return 'today';
  return 'upcoming';
}

const STYLES: Record<ReturnType<typeof taskUrgency>, string> = {
  overdue: 'bg-destructive-muted text-destructive-muted-foreground',
  today: 'bg-warning-muted text-warning-muted-foreground',
  upcoming: 'bg-muted text-muted-foreground',
};

function dueLabel(dueDate: string, urgency: ReturnType<typeof taskUrgency>): string {
  if (urgency === 'today') return 'Today';
  const due = new Date(dueDate);
  if (urgency === 'overdue') return 'Overdue';
  return due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** The next open task on a lead, with a one-click complete. */
export function LeadTaskBadge({
  task,
  onComplete,
  className,
}: {
  task: LeadTask;
  onComplete?: (taskId: string) => void;
  className?: string;
}) {
  const urgency = taskUrgency(task.dueDate);

  return (
    <div className={cn('mt-2 border-t pt-2', className)}>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Task</p>
      <div className="flex items-center gap-1.5">
        {onComplete && (
          <button
            type="button"
            title="Mark done"
            aria-label={`Complete task: ${task.title}`}
            // The card itself opens the lead and is a drag handle, so this must not bubble into
            // either — a click meant to tick something off should never also start a drag.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onComplete(task.id);
            }}
            className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-green-600"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="min-w-0 flex-1 truncate text-xs" title={task.title}>
          {task.title}
        </span>
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', STYLES[urgency])}>
          {dueLabel(task.dueDate, urgency)}
        </span>
      </div>
    </div>
  );
}
