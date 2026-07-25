'use client';

import { Fragment } from 'react';
import {
  ALL_TEETH,
  ARCH_WIDTH,
  LAYOUT,
  LOWER_TEETH,
  MIDLINE_GAP,
  PALETTE,
  SLOT_WIDTH,
  TOOTH_CONDITION_LABELS,
  UPPER_TEETH,
  buildBone,
  buildGumPath,
  buildTooth,
  buildToothMarker,
  type ChartMode,
  type DrawOp,
  type ToothCondition,
} from '@dental-crm/shared';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

export interface ToothItem {
  description: string;
  category?: string;
}

export interface DentalChartProps {
  /** What each tooth should look like. Teeth left out are drawn healthy. */
  conditionsByTooth?: Record<string, ToothCondition>;
  /** Procedures planned per tooth, surfaced on hover. */
  itemsByTooth?: Record<string, ToothItem[]>;
  /** `diagnosis` draws natural colours and findings; `plan` draws the proposal in green. */
  mode?: ChartMode;
  selectedTooth?: string | null;
  onToothSelect?: (tooth: string) => void;
  className?: string;
}

function Ops({ ops }: { ops: DrawOp[] }) {
  return (
    <>
      {ops.map((op, i) => {
        switch (op.kind) {
          case 'path':
            return (
              <path
                key={i}
                d={op.d}
                fill={op.fill ?? 'none'}
                stroke={op.stroke}
                strokeWidth={op.strokeWidth}
                opacity={op.opacity}
                strokeLinejoin="round"
              />
            );
          case 'circle':
            return (
              <circle key={i} cx={op.cx} cy={op.cy} r={op.r} fill={op.fill} stroke={op.stroke} strokeWidth={op.strokeWidth} />
            );
          case 'rect':
            return (
              <rect
                key={i}
                x={op.x}
                y={op.y}
                width={op.width}
                height={op.height}
                rx={op.rx}
                fill={op.fill}
                stroke={op.stroke}
                strokeWidth={op.strokeWidth}
                opacity={op.opacity}
              />
            );
          case 'line':
            return (
              <line
                key={i}
                x1={op.x1}
                y1={op.y1}
                x2={op.x2}
                y2={op.y2}
                stroke={op.stroke}
                strokeWidth={op.strokeWidth}
                opacity={op.opacity}
                strokeLinecap="round"
              />
            );
        }
      })}
    </>
  );
}

function slotX(index: number) {
  return SLOT_WIDTH * (index + 0.5) + (index >= 8 ? MIDLINE_GAP : 0);
}

function Arch({
  teeth,
  conditionsByTooth,
  itemsByTooth,
  mode,
  selectedTooth,
  onToothSelect,
  upper,
}: {
  teeth: string[];
  conditionsByTooth: Record<string, ToothCondition>;
  itemsByTooth: Record<string, ToothItem[]>;
  mode: ChartMode;
  selectedTooth?: string | null;
  onToothSelect?: (tooth: string) => void;
  upper: boolean;
}) {
  const recession: Record<number, boolean> = {};
  const edentulous: Record<number, boolean> = {};
  teeth.forEach((t, i) => {
    if (conditionsByTooth[t] === 'RECEDING_BONE') recession[i] = true;
    if (conditionsByTooth[t] === 'MISSING') edentulous[i] = true;
  });
  const layers = teeth.map((t) => buildTooth(t, conditionsByTooth[t] ?? 'HEALTHY', mode));
  const gumY = upper ? LAYOUT.upperGumY : LAYOUT.lowerGumY;

  // Both arches come from the same canonical geometry (crown up, root down) and the upper one is
  // flipped. Roots are drawn before the gum and crowns after it, so each tooth emerges from the gum
  // the way it does in life. The number labels sit outside the flipped group — mirrored text would
  // read upside down.
  const arch = (
    <g transform={upper ? `translate(0 ${gumY}) scale(1 -1)` : `translate(0 ${gumY})`}>
      <Ops ops={buildBone(upper ? 11 : 29)} />
      {layers.map((layer, i) => (
        <g key={teeth[i]} transform={`translate(${slotX(i)} 0)`}>
          <Ops ops={layer.subgingival} />
        </g>
      ))}
      <path d={buildGumPath(teeth.length, recession, edentulous)} fill={PALETTE.gum} />
      {layers.map((layer, i) => (
        <g key={teeth[i]} transform={`translate(${slotX(i)} 0)`}>
          <Ops ops={layer.supragingival} />
          <Ops ops={buildToothMarker(conditionsByTooth[teeth[i]] ?? 'HEALTHY', mode)} />
        </g>
      ))}
    </g>
  );

  const labelY = upper ? LAYOUT.upperLabelY : LAYOUT.lowerLabelY;

  return (
    <g>
      {arch}
      {teeth.map((tooth, i) => {
        const condition = conditionsByTooth[tooth] ?? 'HEALTHY';
        const items = itemsByTooth[tooth] ?? [];
        const selected = selectedTooth === tooth;
        const hasDetail = condition !== 'HEALTHY' || items.length > 0;

        const label = (
          <g
            transform={`translate(${slotX(i)} 0)`}
            onClick={onToothSelect ? () => onToothSelect(tooth) : undefined}
            className={onToothSelect ? 'cursor-pointer' : undefined}
          >
            {/* A generous invisible hit area — clicking a thin tooth outline is fiddly, and the
                whole column reads as "that tooth" to anyone using the chart. */}
            <rect
              x={-SLOT_WIDTH / 2}
              y={upper ? LAYOUT.upperGumY - 4 : LAYOUT.lowerLabelY - 14}
              width={SLOT_WIDTH}
              height={upper ? LAYOUT.upperLabelY - LAYOUT.upperGumY + 10 : LAYOUT.lowerGumY - LAYOUT.lowerLabelY + 18}
              fill={selected ? PALETTE.marker : 'transparent'}
              opacity={selected ? 0.1 : 1}
              rx={6}
            />
            <text
              x={0}
              y={labelY}
              textAnchor="middle"
              fontSize={17}
              fontWeight={selected ? 700 : 500}
              fill={selected ? PALETTE.marker : '#71717a'}
            >
              {tooth}
            </text>
          </g>
        );

        if (!hasDetail) return <Fragment key={tooth}>{label}</Fragment>;

        return (
          <Tooltip key={tooth}>
            <TooltipTrigger asChild>{label}</TooltipTrigger>
            <TooltipContent side={upper ? 'top' : 'bottom'} className="max-w-[220px]">
              <p className="font-semibold">Tooth {tooth}</p>
              {condition !== 'HEALTHY' && <p>{TOOTH_CONDITION_LABELS[condition]}</p>}
              {items.length > 0 && (
                <ul className="mt-0.5 list-disc pl-3">
                  {items.map((it, idx) => (
                    <li key={idx}>
                      {it.description}
                      {it.category && <span className="text-muted-foreground"> · {it.category}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </g>
  );
}

export function DentalChart({
  conditionsByTooth = {},
  itemsByTooth = {},
  mode = 'diagnosis',
  selectedTooth,
  onToothSelect,
  className,
}: DentalChartProps) {
  const totalHeight = LAYOUT.height;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn('w-full overflow-x-auto rounded-lg border bg-card p-3', className)}>
        <svg viewBox={`0 0 ${ARCH_WIDTH} ${totalHeight}`} className="h-auto w-full min-w-[680px]" role="img">
          <Arch
            teeth={UPPER_TEETH}
            conditionsByTooth={conditionsByTooth}
            itemsByTooth={itemsByTooth}
            mode={mode}
            selectedTooth={selectedTooth}
            onToothSelect={onToothSelect}
            upper
          />
          {/* The facial midline separating the right and left quadrants. */}
          <line
            x1={ARCH_WIDTH / 2}
            y1={0}
            x2={ARCH_WIDTH / 2}
            y2={totalHeight}
            stroke="#d4d4d8"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <Arch
            teeth={LOWER_TEETH}
            conditionsByTooth={conditionsByTooth}
            itemsByTooth={itemsByTooth}
            mode={mode}
            selectedTooth={selectedTooth}
            onToothSelect={onToothSelect}
            upper={false}
          />
        </svg>
      </div>
    </TooltipProvider>
  );
}

export { ALL_TEETH };
