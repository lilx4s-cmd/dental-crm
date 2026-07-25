'use client';

import {
  TOOTH_CONDITION_LABELS,
  computePhaseTotals,
  conditionFromText,
  parseToothNumbers,
  type ToothCondition,
} from '@dental-crm/shared';

import { DentalChart, type ToothItem } from './dental-chart';

/**
 * The subset of a plan these views actually draw. Declared structurally rather than importing the
 * dashboard's TreatmentPlan so the patient portal — whose plan is deliberately sanitized and lacks
 * several staff-only fields — can render the very same components.
 */
export interface PlanLike {
  currency: string;
  items: Array<{
    id: string;
    description: string;
    toothNumber: string | null;
    quantity: number;
    cost: number;
    material: string | null;
    brand: string | null;
    phaseNumber: number;
    toothCondition: ToothCondition | null;
    treatmentCategory: { name: string } | null;
  }>;
  diagnoses?: Array<{ id: string; condition: ToothCondition; toothNumbers: string[]; notes: string | null }>;
  phases?: Array<{
    phaseNumber: number;
    name: string | null;
    discountAmount: number;
    discountPercent: number | null;
    healingPeriodMonths: number | null;
  }>;
}

function fmt(n: number, currency: string) {
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

/** What the mouth looks like today, straight from the charted findings. */
export function diagnosisConditions(plan: PlanLike): Record<string, ToothCondition> {
  const map: Record<string, ToothCondition> = {};
  for (const d of plan.diagnoses ?? []) {
    for (const tooth of d.toothNumbers) map[tooth] = d.condition;
  }
  return map;
}

/**
 * What the mouth looks like once the plan is done. Teeth already missing stay missing unless the
 * plan puts something back, so the "after" picture never grows teeth the patient does not have.
 * The per-item condition is used when set, and otherwise inferred from the category or description
 * — older plans predate the stored column and would otherwise chart as untouched.
 */
export function plannedConditions(plan: PlanLike): Record<string, ToothCondition> {
  const map: Record<string, ToothCondition> = {};
  for (const d of plan.diagnoses ?? []) {
    if (d.condition === 'MISSING') for (const tooth of d.toothNumbers) map[tooth] = 'MISSING';
  }
  for (const item of plan.items) {
    const condition = item.toothCondition ?? conditionFromText(item.treatmentCategory?.name, item.description);
    if (!condition) continue;
    for (const tooth of parseToothNumbers(item.toothNumber)) map[tooth] = condition;
  }
  return map;
}

/**
 * The mouth part-way through treatment: everything charted today, plus the effect of every phase up
 * to and including `stage`. Stage 0 is the starting point, so stepping the number forward walks the
 * patient through their own treatment.
 *
 * A tooth extracted in an earlier phase is shown as missing from the next phase onward rather than
 * keeping its extraction cross forever — the cross means "this is coming out", and once it has, the
 * honest picture is a gap. A later implant or bridge on the same tooth overwrites it, which is why
 * phases are applied in order.
 */
export function stageConditions(plan: PlanLike, stage: number): Record<string, ToothCondition> {
  const map: Record<string, ToothCondition> = diagnosisConditions(plan);
  const appliedAtPhase: Record<string, number> = {};

  const phasesInOrder = [...new Set(plan.items.map((i) => i.phaseNumber || 1))].sort((a, b) => a - b);
  for (const phase of phasesInOrder) {
    if (phase > stage) break;
    for (const item of plan.items) {
      if ((item.phaseNumber || 1) !== phase) continue;
      const condition = item.toothCondition ?? conditionFromText(item.treatmentCategory?.name, item.description);
      if (!condition) continue;
      for (const tooth of parseToothNumbers(item.toothNumber)) {
        map[tooth] = condition;
        appliedAtPhase[tooth] = phase;
      }
    }
  }

  for (const [tooth, condition] of Object.entries(map)) {
    if (condition === 'EXTRACTION' && appliedAtPhase[tooth] < stage) map[tooth] = 'MISSING';
  }
  return map;
}

export function plannedItemsByTooth(plan: PlanLike): Record<string, ToothItem[]> {
  const map: Record<string, ToothItem[]> = {};
  for (const item of plan.items) {
    for (const tooth of parseToothNumbers(item.toothNumber)) {
      (map[tooth] ??= []).push({ description: item.description, category: item.treatmentCategory?.name });
    }
  }
  return map;
}

export function PlanDiagnoses({ plan }: { plan: PlanLike }) {
  const diagnoses = plan.diagnoses ?? [];
  if (diagnoses.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">Current dental status</p>
      <DentalChart mode="diagnosis" conditionsByTooth={diagnosisConditions(plan)} />
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-1.5 text-left">Diagnosis</th>
              <th className="px-3 py-1.5 text-left">Teeth</th>
            </tr>
          </thead>
          <tbody>
            {diagnoses.map((d) => (
              <tr key={d.id} className="border-t">
                <td className="px-3 py-1.5">
                  {TOOTH_CONDITION_LABELS[d.condition]}
                  {d.notes && <span className="ml-1 text-muted-foreground">· {d.notes}</span>}
                </td>
                <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                  {[...d.toothNumbers].sort().join('  |  ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Procedures grouped into the phases they are carried out in, each with its own subtotal. */
export function PlanProcedures({ plan, showChart = true }: { plan: PlanLike; showChart?: boolean }) {
  if (plan.items.length === 0) return null;

  const totals = computePhaseTotals(
    plan.items.map((i) => ({ cost: Number(i.cost), phaseNumber: i.phaseNumber })),
    (plan.phases ?? []).map((p) => ({
      phaseNumber: p.phaseNumber,
      name: p.name,
      discountAmount: p.discountAmount == null ? null : Number(p.discountAmount),
      discountPercent: p.discountPercent == null ? null : Number(p.discountPercent),
      healingPeriodMonths: p.healingPeriodMonths,
    })),
  );
  const grandTotal = totals.reduce((s, t) => s + t.total, 0);
  // A single unnamed, undiscounted phase is just "the plan" — labelling it adds nothing.
  const showPhaseHeadings = totals.length > 1 || totals.some((t) => t.name || t.discount > 0 || t.healingPeriodMonths);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">Proposed treatment</p>
      {showChart && (
        <DentalChart
          mode="plan"
          conditionsByTooth={plannedConditions(plan)}
          itemsByTooth={plannedItemsByTooth(plan)}
        />
      )}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-1.5 text-left">Procedure</th>
              <th className="px-2 py-1.5 text-center">Tooth</th>
              <th className="px-2 py-1.5 text-left">Material / Brand</th>
              <th className="px-3 py-1.5 text-right">Qty</th>
              <th className="px-3 py-1.5 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((phase) => (
              <PhaseRows
                key={phase.phaseNumber}
                plan={plan}
                phaseNumber={phase.phaseNumber}
                heading={
                  showPhaseHeadings ? phase.name || `Phase ${phase.phaseNumber}` : null
                }
                subtotal={phase.total}
                discount={phase.discount}
                healingPeriodMonths={phase.healingPeriodMonths}
              />
            ))}
            <tr className="border-t-2 bg-muted/40 font-semibold">
              <td className="px-3 py-1.5" colSpan={4}>
                Total
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fmt(grandTotal, plan.currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PhaseRows({
  plan,
  phaseNumber,
  heading,
  subtotal,
  discount,
  healingPeriodMonths,
}: {
  plan: PlanLike;
  phaseNumber: number;
  heading: string | null;
  subtotal: number;
  discount: number;
  healingPeriodMonths?: number | null;
}) {
  const items = plan.items.filter((i) => (i.phaseNumber || 1) === phaseNumber);

  return (
    <>
      {heading && (
        <tr className="border-t bg-muted/30 font-semibold">
          <td className="px-3 py-1.5" colSpan={4}>
            {heading}
          </td>
          <td className="px-3 py-1.5 text-right tabular-nums">{fmt(subtotal, plan.currency)}</td>
        </tr>
      )}
      {items.map((item) => (
        <tr key={item.id} className="border-t">
          <td className="px-3 py-1.5">
            {item.description}
            {item.treatmentCategory && (
              <span className="ml-1 text-muted-foreground">· {item.treatmentCategory.name}</span>
            )}
          </td>
          <td className="px-2 py-1.5 text-center text-muted-foreground">{item.toothNumber ?? '—'}</td>
          <td className="px-2 py-1.5 text-muted-foreground">
            {[item.material, item.brand].filter(Boolean).join(' / ') || '—'}
          </td>
          <td className="px-3 py-1.5 text-right">{item.quantity}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{fmt(Number(item.cost), plan.currency)}</td>
        </tr>
      ))}
      {discount > 0 && (
        <tr className="border-t">
          <td className="px-3 py-1.5 font-medium" colSpan={4}>
            Discount
          </td>
          <td className="px-3 py-1.5 text-right tabular-nums">−{fmt(discount, plan.currency)}</td>
        </tr>
      )}
      {!!healingPeriodMonths && (
        <tr className="border-t">
          <td className="px-3 py-1.5 font-medium" colSpan={4}>
            Healing period
          </td>
          <td className="px-3 py-1.5 text-right text-muted-foreground">{healingPeriodMonths} months</td>
        </tr>
      )}
    </>
  );
}
