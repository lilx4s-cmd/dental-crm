'use client';

import { Check, Circle, CircleDot, MinusCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { TimelineStep } from '@/hooks/use-treatment-plans';

// Presentational vertical stepper shared by the staff dashboard tab and the public patient
// portal. Kept free of data-fetching/auth so it renders identically in both contexts; any
// interactivity is opt-in via `onStepClick` (staff pass it, the portal doesn't).
const STATUS_META: Record<
  string,
  { icon: typeof Circle; iconClass: string; lineClass: string; label: string }
> = {
  COMPLETED: { icon: Check, iconClass: 'bg-green-600 text-white border-green-600', lineClass: 'bg-green-600', label: 'Completed' },
  IN_PROGRESS: { icon: CircleDot, iconClass: 'bg-blue-600 text-white border-blue-600', lineClass: 'bg-border', label: 'In progress' },
  SKIPPED: { icon: MinusCircle, iconClass: 'bg-muted text-muted-foreground border-border', lineClass: 'bg-border', label: 'Skipped' },
  PENDING: { icon: Circle, iconClass: 'bg-background text-muted-foreground border-border', lineClass: 'bg-border', label: 'Pending' },
};

export function TimelineStepper({
  steps,
  onStepClick,
  className,
}: {
  steps: TimelineStep[];
  onStepClick?: (step: TimelineStep) => void;
  className?: string;
}) {
  if (!steps.length) {
    return <p className="text-xs text-muted-foreground">No timeline steps yet.</p>;
  }

  const ordered = [...steps].sort((a, b) => a.order - b.order);

  return (
    <ol className={cn('relative space-y-0', className)}>
      {ordered.map((step, i) => {
        const meta = STATUS_META[step.status] ?? STATUS_META.PENDING;
        const Icon = meta.icon;
        const isLast = i === ordered.length - 1;
        const dimmed = step.status === 'SKIPPED';

        return (
          <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Connector line to the next node. */}
            {!isLast && <span className={cn('absolute left-[13px] top-7 h-full w-0.5', meta.lineClass)} aria-hidden />}

            <span
              className={cn(
                'z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                meta.iconClass,
              )}
            >
              <Icon className="h-4 w-4" />
            </span>

            <div className={cn('min-w-0 flex-1 pt-0.5', dimmed && 'opacity-60')}>
              {onStepClick ? (
                <button
                  type="button"
                  onClick={() => onStepClick(step)}
                  className={cn('text-left text-sm font-medium hover:underline', dimmed && 'line-through')}
                >
                  {step.title}
                </button>
              ) : (
                <p className={cn('text-sm font-medium', dimmed && 'line-through')}>{step.title}</p>
              )}
              {step.description && <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>}
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {meta.label}
                {step.completedAt && ` · ${format(new Date(step.completedAt), 'MMM d, yyyy')}`}
                {!step.completedAt && step.dueDate && ` · due ${format(new Date(step.dueDate), 'MMM d, yyyy')}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
