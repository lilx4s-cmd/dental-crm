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

export interface ToothItem {
  description: string;
  category?: string;
}

interface DentalChartProps {
  // toothNumber -> the procedure(s) already planned on it. The FIRST item's category decides
  // the tooth's color, so the chart visually updates the moment a procedure/category is picked —
  // that's the "simulation" the picker is going for, without needing per-tooth 3D art.
  itemsByTooth?: Record<string, ToothItem[]>;
  selectedTooth?: string | null;
  onToothSelect?: (tooth: string) => void;
  className?: string;
}

// One color per treatment category, chosen to read as a plausible material at a glance
// (metal for implants, gold for crowns, red for root canal, grey/faded for extraction, etc.)
// rather than an arbitrary palette. Matched loosely by substring so category naming drift
// (e.g. "Root Canal Treatment" vs "Root Canal") still resolves correctly.
const CATEGORY_COLORS: { match: string; fill: string }[] = [
  { match: 'implant', fill: '#64748b' }, // slate — titanium
  { match: 'crown', fill: '#d4af37' }, // gold
  { match: 'veneer', fill: '#7dd3fc' }, // porcelain blue-white
  { match: 'root canal', fill: '#ef4444' }, // red
  { match: 'filling', fill: '#a1a1aa' }, // amalgam grey
  { match: 'extraction', fill: '#d1d5db' }, // faded — being removed
  { match: 'bone graft', fill: '#84cc16' },
  { match: 'sinus lift', fill: '#14b8a6' },
  { match: 'clean', fill: '#38bdf8' },
  { match: 'whiten', fill: '#fde68a' },
  { match: 'ortho', fill: '#a78bfa' },
];
const DEFAULT_PLANNED_FILL = '#93c5fd'; // generic "has a procedure, no category yet" blue
const HEALTHY_FILL = '#ffffff';

function colorFor(category?: string): string {
  if (!category) return DEFAULT_PLANNED_FILL;
  const needle = category.toLowerCase();
  return CATEGORY_COLORS.find((c) => needle.includes(c.match))?.fill ?? DEFAULT_PLANNED_FILL;
}

// A single simplified but recognizably tooth-shaped silhouette (rounded crown + two roots) —
// reused for every tooth rather than modeling incisors/molars separately, so the chart stays
// visually simple while still looking like an actual tooth instead of a box or circle. Lower-arch
// teeth pass `flip` to mirror the roots downward, matching how they actually sit in the jaw.
function ToothShape({ fill, flip, faded }: { fill: string; flip: boolean; faded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 34"
      className={cn('h-8 w-6 transition-transform duration-150 group-hover:scale-110', faded && 'opacity-40')}
      style={{ transform: flip ? 'scaleY(-1)' : undefined }}
    >
      <path
        d="M12 1.5C7.5 1.5 4 4.5 4 9c0 2.8.9 4.8 1.4 7.6.5 2.7.9 6.6 2 9 .6 1.3 1.6 1.2 2-.1.5-1.9.9-4.4 1.4-5.8.2-.6.5-.9.8-.9s.6.3.8.9c.5 1.4.9 3.9 1.4 5.8.4 1.3 1.4 1.4 2 .1 1.1-2.4 1.5-6.3 2-9C19.1 13.8 20 11.8 20 9c0-4.5-3.5-7.5-8-7.5Z"
        fill={fill}
        stroke="#94a3b8"
        strokeWidth="1"
      />
    </svg>
  );
}

function Tooth({
  number,
  items,
  selected,
  onSelect,
}: {
  number: string;
  items: ToothItem[];
  selected: boolean;
  onSelect?: (tooth: string) => void;
}) {
  const arch = number[0];
  const isLower = arch === '3' || arch === '4';
  const hasItems = items.length > 0;
  const isExtraction = items[0]?.category?.toLowerCase().includes('extraction') ?? false;
  const fill = hasItems ? colorFor(items[0]?.category) : HEALTHY_FILL;

  const button = (
    <button
      type="button"
      onClick={() => onSelect?.(number)}
      aria-pressed={selected}
      className={cn(
        'group relative flex flex-col items-center gap-0.5 rounded-md p-1 transition-colors',
        'hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        selected && 'bg-primary/10 ring-1 ring-primary',
      )}
    >
      <ToothShape fill={fill} flip={isLower} faded={isExtraction} />
      <span className={cn('text-[10px] font-medium tabular-nums', selected ? 'text-primary' : 'text-muted-foreground')}>
        {number}
      </span>
      {hasItems && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold text-primary-foreground">
          {items.length}
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
          {items.map((it, i) => (
            <li key={i}>
              {it.description}
              {it.category && <span className="text-muted-foreground"> · {it.category}</span>}
            </li>
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
  itemsByTooth: Record<string, ToothItem[]>;
  selectedTooth?: string | null;
  onToothSelect?: (tooth: string) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {teeth.map((t) => (
        <Tooth key={t} number={t} items={itemsByTooth[t] ?? []} selected={selectedTooth === t} onSelect={onToothSelect} />
      ))}
    </div>
  );
}

export function DentalChart({ itemsByTooth = {}, selectedTooth, onToothSelect, className }: DentalChartProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn('inline-flex flex-col items-center gap-2 rounded-lg border bg-card p-4', className)}>
        {/* Upper arch — quadrants 1 (right) and 2 (left), split at the facial midline. */}
        <div className="flex items-end gap-2">
          <Row teeth={UPPER_RIGHT} itemsByTooth={itemsByTooth} selectedTooth={selectedTooth} onToothSelect={onToothSelect} />
          <div className="mb-3 h-8 w-px bg-border" aria-hidden />
          <Row teeth={UPPER_LEFT} itemsByTooth={itemsByTooth} selectedTooth={selectedTooth} onToothSelect={onToothSelect} />
        </div>

        {/* Midline separating upper from lower arch. */}
        <div className="flex w-full items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>Right · Left</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* Lower arch — quadrants 4 (right) and 3 (left). */}
        <div className="flex items-start gap-2">
          <Row teeth={LOWER_RIGHT} itemsByTooth={itemsByTooth} selectedTooth={selectedTooth} onToothSelect={onToothSelect} />
          <div className="mt-3 h-8 w-px bg-border" aria-hidden />
          <Row teeth={LOWER_LEFT} itemsByTooth={itemsByTooth} selectedTooth={selectedTooth} onToothSelect={onToothSelect} />
        </div>

        {/* Legend — kept to just what's relevant so the chart doesn't get busy. */}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t pt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: HEALTHY_FILL }} /> Healthy
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: DEFAULT_PLANNED_FILL }} /> Planned
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: colorFor('crown') }} /> Crown
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border" style={{ backgroundColor: colorFor('implant') }} /> Implant
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border opacity-40" style={{ backgroundColor: colorFor('extraction') }} /> Extraction
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
