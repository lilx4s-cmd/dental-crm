'use client';

import {
  TOOTH_CONDITION_LABELS,
  computePhaseTotals,
  conditionFromText,
  type ToothCondition,
} from '@dental-crm/shared';

import type { TreatmentPlan } from '@/hooks/use-treatment-plans';
import { DentalChart, type ToothItem } from './dental-chart';

function fmt(n: number, currency: string) {
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

/** What the mouth looks like today, straight from the charted findings. */
export function diagnosisConditions(plan: TreatmentPlan): Record<string, ToothCondition> {
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
export function plannedConditions(plan: TreatmentPlan): Record<string, ToothCondition> {
  const map: Record<string, ToothCondition> = {};
  for (const d of plan.diagnoses ?? []) {
    if (d.condition === 'MISSING') for (const tooth of d.toothNumbers) map[tooth] = 'MISSING';
  }
  for (const item of plan.items) {
    if (!item.toothNumber) continue;
    const condition = item.toothCondition ?? conditionFromText(item.treatmentCategory?.name, item.description);
    if (condition) map[item.toothNumber] = condition;
  }
  return map;
}

export function plannedItemsByTooth(plan: TreatmentPlan): Record<string, ToothItem[]> {
  const map: Record<string, ToothItem[]> = {};
  for (const item of plan.items) {
    if (!item.toothNumber) continue;
    (map[item.toothNumber] ??= []).push({
      description: item.description,
      category: item.treatmentCategory?.name,
    });
  }
  return map;
}

export function PlanDiagnoses({ plan }: { plan: TreatmentPlan }) {
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
export function PlanProcedures({ plan, showChart = true }: { plan: TreatmentPlan; showChart?: boolean }) {
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
  plan: TreatmentPlan;
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
