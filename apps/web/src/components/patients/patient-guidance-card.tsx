'use client';

import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, CircleAlert, Circle } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePatientGuidance, type PatientStep } from '@/hooks/use-patients';
import { cn } from '@/lib/utils';

const SEVERITY_LABEL: Record<PatientStep['severity'], string> = {
  safety: 'Safety',
  blocking: 'Needed',
  admin: 'Admin',
};

/**
 * How each severity reads at a glance.
 *
 * Only safety gets a colour that shouts. If everything is red then nothing is, and the point of
 * this card is that one row on it — the unanswered allergy question — matters more than the rest
 * put together.
 */
const SEVERITY_STYLE: Record<PatientStep['severity'], string> = {
  safety: 'text-destructive-muted-foreground',
  blocking: 'text-amber-700 dark:text-amber-400',
  admin: 'text-muted-foreground',
};

function StepRow({ step }: { step: PatientStep }) {
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      {step.done ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Done" />
      ) : step.severity === 'safety' ? (
        <CircleAlert
          className="mt-0.5 h-4 w-4 shrink-0 text-destructive-muted-foreground"
          aria-label="Safety question outstanding"
        />
      ) : (
        <Circle className={cn('mt-0.5 h-4 w-4 shrink-0', SEVERITY_STYLE[step.severity])} aria-label="Outstanding" />
      )}

      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', step.done ? 'text-muted-foreground line-through' : 'font-medium')}>
          {step.label}
        </p>
        {/* The reason is always shown, not tucked into a tooltip. A list of ticks trains people to
            clear them; a list that says what skipping one costs gets read. */}
        <p className={cn('text-xs', step.done ? 'text-muted-foreground/70' : SEVERITY_STYLE[step.severity])}>
          {step.why}
        </p>
      </div>

      {!step.done && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {SEVERITY_LABEL[step.severity]}
        </span>
      )}
    </li>
  );
}

/**
 * What to do next with this patient.
 *
 * The pipeline has told salespeople which deal to chase since `nextAction` was written. The
 * patient side had nothing: once a lead converted the CRM stopped offering an opinion and became a
 * set of forms somebody had to remember to fill in — at exactly the point where the cost of
 * forgetting rises from a lost sale to a missed allergy.
 *
 * Collapsed to the single next thing by default. A checklist of a dozen items is one people scroll
 * past; one sentence saying what to do now is one they act on. The rest is a click away for
 * whoever is doing a full review.
 */
export function PatientGuidanceCard({ patientId }: { patientId: string }) {
  const { data, isLoading } = usePatientGuidance(patientId);
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { nextStep, outstanding, steps, counts, completeness } = data;
  const safetyOutstanding = counts.safety > 0;

  return (
    <Card className={cn(safetyOutstanding && 'border-destructive/40')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">Next steps</CardTitle>
            <CardDescription>
              {nextStep
                ? `${outstanding.length} outstanding · record ${completeness}% complete`
                : 'Nothing outstanding on this record.'}
            </CardDescription>
          </div>
          {steps.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={() => setExpanded((v) => !v)}>
              {expanded ? (
                <>
                  <ChevronUp className="mr-1 h-3.5 w-3.5" /> Less
                </>
              ) : (
                <>
                  <ChevronDown className="mr-1 h-3.5 w-3.5" /> All {steps.length}
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Stated once, above everything. Five unanswered safety questions on a record somebody is
            about to treat from is not a checklist item, it is the headline. */}
        {safetyOutstanding && (
          <p className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive-muted px-3 py-2 text-xs text-destructive-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {counts.safety === 1
                ? 'One medical question has never been answered on this record.'
                : `${counts.safety} medical questions have never been answered on this record.`}{' '}
              A blank is an open question, not a &ldquo;no&rdquo;.
            </span>
          </p>
        )}

        {!nextStep ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-success" />
            Everything this record needs is on file.
          </p>
        ) : (
          <ul className="divide-y">
            {(expanded ? steps : [nextStep]).map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </ul>
        )}

        {!expanded && outstanding.length > 1 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {outstanding.length - 1} more outstanding.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A three-way answer: yes, no, or not asked.
 *
 * A checkbox cannot express the third, and the third is the one that matters — an unticked box
 * reads as "no" to whoever opens the record next, which turns a question nobody asked into a
 * clinical answer nobody gave.
 *
 * "Not asked" stays selectable after an answer is given, so a wrong entry can be withdrawn rather
 * than only corrected to the opposite.
 */
export function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}) {
  const options: { text: string; v: boolean | undefined }[] = [
    { text: 'Yes', v: true },
    { text: 'No', v: false },
    { text: 'Not asked', v: undefined },
  ];

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex rounded-md border" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.text}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            onClick={() => onChange(o.v)}
            className={cn(
              'flex-1 px-1.5 py-1 text-xs transition-colors first:rounded-l-md last:rounded-r-md',
              value === o.v
                ? o.v === true
                  ? 'bg-destructive-muted font-medium text-destructive-muted-foreground'
                  : o.v === false
                    ? 'bg-success-muted font-medium text-success'
                    : 'bg-muted font-medium'
                : 'hover:bg-muted/60',
            )}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}
