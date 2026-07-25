'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { computePhaseTotals } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DentalChart } from '@/components/treatment-plans/dental-chart';
import { stageConditions, type PlanLike } from '@/components/treatment-plans/plan-summary';

const STEP_MS = 2600;

interface Stage {
  index: number;
  label: string;
  caption: string;
  procedures: string[];
}

/**
 * Walks the patient through their own treatment one phase at a time. It draws the same arch as the
 * plan and the PDF — only the conditions change per step — so what they scanned a code to watch is
 * demonstrably the plan they were given, not a separate illustration.
 */
export function TreatmentAnimation({ plan }: { plan: PlanLike }) {
  const stages = useMemo<Stage[]>(() => {
    const totals = computePhaseTotals(
      plan.items.map((i) => ({ cost: Number(i.cost), phaseNumber: i.phaseNumber })),
      (plan.phases ?? []).map((p) => ({
        phaseNumber: p.phaseNumber,
        name: p.name,
        healingPeriodMonths: p.healingPeriodMonths,
      })),
    );

    return [
      {
        index: 0,
        label: 'Today',
        caption: 'Your mouth as it is now.',
        procedures: [],
      },
      ...totals.map((phase) => ({
        index: phase.phaseNumber,
        label: phase.name || `Phase ${phase.phaseNumber}`,
        caption: phase.healingPeriodMonths
          ? `Followed by a ${phase.healingPeriodMonths} month healing period.`
          : 'Once this stage is complete.',
        procedures: [
          ...new Set(
            plan.items
              .filter((i) => (i.phaseNumber || 1) === phase.phaseNumber)
              .map((i) => i.description)
              .filter(Boolean),
          ),
        ],
      })),
    ];
  }, [plan]);

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const atEnd = step >= stages.length - 1;

  useEffect(() => {
    if (!playing) return;
    // Stop at the finished result rather than looping back to the problems — the last frame is the
    // one worth sitting on.
    if (atEnd) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, step, atEnd]);

  const stage = stages[step] ?? stages[0];
  const conditions = useMemo(() => stageConditions(plan, stage.index), [plan, stage.index]);

  return (
    <div className="space-y-4">
      <DentalChart mode={step === 0 ? 'diagnosis' : 'plan'} conditionsByTooth={conditions} />

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous stage"
          disabled={step === 0}
          onClick={() => {
            setPlaying(false);
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {atEnd ? (
          <Button
            variant="secondary"
            onClick={() => {
              setStep(0);
              setPlaying(true);
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Watch again
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {playing ? 'Pause' : 'Play'}
          </Button>
        )}

        <Button
          variant="outline"
          size="icon"
          aria-label="Next stage"
          disabled={atEnd}
          onClick={() => {
            setPlaying(false);
            setStep((s) => Math.min(stages.length - 1, s + 1));
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Stage markers double as a scrubber, so a patient can jump straight to the end result. */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {stages.map((s, i) => (
          <button
            key={s.index}
            type="button"
            onClick={() => {
              setPlaying(false);
              setStep(i);
            }}
            aria-current={i === step}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              i === step
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border bg-card p-4 text-center">
        <p className="text-lg font-semibold">{stage.label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{stage.caption}</p>
        {stage.procedures.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {stage.procedures.map((p) => (
              <span key={p} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
