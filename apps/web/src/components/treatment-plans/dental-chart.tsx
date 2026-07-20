'use client';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

// FDI World Dental Federation two-digit notation (ISO 3950) — the international/Turkish
// convention. First digit = quadrant (1=upper-right, 2=upper-left, 3=lower-left, 4=lower-right),
// second digit = tooth position from the midline outward (1=central incisor … 8=third molar).
// `TreatmentPlanItem.toothNumber` is a free-text string, so this is purely a rendering
// convention on the frontend — no schema constraint enforces it.
const UPPER_RIGHT = ['18', '17', '16', '15', '14', '13', '12', '11'];
const UPPER_LEFT = ['21', '22', '23', '24', '25', '26', '27', '28'];
const LOWER_RIGHT = ['48', '47', '46', '45', '44', '43', '42', '41'];
const LOWER_LEFT = ['31', '32', '33', '34', '35', '36', '37', '38'];

interface DentalChartProps {
  // toothNumber -> descriptions of the procedures already planned on it (for the tooltip + count badge).
  itemsByTooth?: Record<string, string[]>;
  selectedTooth?: string | null;
  onToothSelect?: (tooth: string) => void;
  className?: string;
}

function Tooth({
  number,
  procedures,
  selected,
  onSelect,
}: {
  number: string;
  procedures: string[];
  selected: boolean;
  onSelect?: (tooth: string) => void;
}) {
  const hasItems = procedures.length > 0;
  const button = (
    <button
      type="button"
      onClick={() => onSelect?.(number)}
      aria-pressed={selected}
      className={cn(
        'relative flex h-11 w-9 flex-col items-center justify-center rounded-md border text-xs font-medium transition-colors',
        'hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : hasItems
            ? 'border-primary/40 bg-primary/10 text-foreground'
            : 'border-input bg-background text-muted-foreground',
      )}
    >
      <span>{number}</span>
      {hasItems && (
        <span
          className={cn(
            'absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
            selected ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground',
          )}
        >
          {procedures.length}
        </span>
      )}
    </button>
  );

  if (!hasItems) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <p className="font-semibold">Tooth {number}</p>
        <ul className="mt-0.5 list-disc pl-3">
          {procedures.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function Row({
  teeth,
  itemsByTooth,
  selectedTooth,
  onToothSelect,
}: {
  teeth: string[];
  itemsByTooth: Record<string, string[]>;
  selectedTooth?: string | null;
  onToothSelect?: (tooth: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {teeth.map((t) => (
        <Tooth
          key={t}
          number={t}
          procedures={itemsByTooth[t] ?? []}
          selected={selectedTooth === t}
          onSelect={onToothSelect}
        />
      ))}
    </div>
  );
}

export function DentalChart({ itemsByTooth = {}, selectedTooth, onToothSelect, className }: DentalChartProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn('inline-flex flex-col items-center gap-2 rounded-lg border bg-card p-4', className)}>
        {/* Upper arch — quadrants 1 (right) and 2 (left), split at the facial midline. */}
        <div className="flex items-center gap-2">
          <Row teeth={UPPER_RIGHT} itemsByTooth={itemsByTooth} selectedTooth={selectedTooth} onToothSelect={onToothSelect} />
          <div className="h-11 w-px bg-border" aria-hidden />
          <Row teeth={UPPER_LEFT} itemsByTooth={itemsByTooth} selectedTooth={selectedTooth} onToothSelect={onToothSelect} />
        </div>

        {/* Midline separating upper from lower arch. */}
        <div className="flex w-full items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>Right · Left</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* Lower arch — quadrants 4 (right) and 3 (left). */}
        <div className="flex items-center gap-2">
          <Row teeth={LOWER_RIGHT} itemsByTooth={itemsByTooth} selectedTooth={selectedTooth} onToothSelect={onToothSelect} />
          <div className="h-11 w-px bg-border" aria-hidden />
          <Row teeth={LOWER_LEFT} itemsByTooth={itemsByTooth} selectedTooth={selectedTooth} onToothSelect={onToothSelect} />
        </div>
      </div>
    </TooltipProvider>
  );
}
