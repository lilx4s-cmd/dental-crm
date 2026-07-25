// Treatment plans are priced in phases: each phase totals its own line items, then takes its own
// discount, and the plan total is the sum of what is left. This lives in the shared package because
// three places have to agree on the number — the API when it persists TreatmentPlan.totalCost, the
// builder while staff are still typing, and the PDF the patient is handed. Any drift between them
// is a quote the clinic cannot stand behind, so there is deliberately only one implementation.

export interface PricedItem {
  cost: number;
  phaseNumber?: number | null;
}

export interface PhaseDiscount {
  phaseNumber: number;
  name?: string | null;
  discountAmount?: number | null;
  discountPercent?: number | null;
  healingPeriodMonths?: number | null;
}

export interface PhaseTotal {
  phaseNumber: number;
  name?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  healingPeriodMonths?: number | null;
}

/** Items with no phase set belong to phase 1 — the common case of a plan done in one go. */
export function phaseOf(item: PricedItem): number {
  return item.phaseNumber && item.phaseNumber > 0 ? item.phaseNumber : 1;
}

export function computePhaseTotals(items: PricedItem[], phases: PhaseDiscount[] = []): PhaseTotal[] {
  const subtotals = new Map<number, number>();
  for (const item of items) {
    const p = phaseOf(item);
    subtotals.set(p, (subtotals.get(p) ?? 0) + item.cost);
  }
  // A phase can carry a discount or a healing period without holding any line items of its own,
  // so phases named by the caller are included even when nothing sums into them.
  for (const p of phases) if (!subtotals.has(p.phaseNumber)) subtotals.set(p.phaseNumber, 0);

  return [...subtotals.keys()]
    .sort((a, b) => a - b)
    .map((phaseNumber) => {
      const subtotal = subtotals.get(phaseNumber) ?? 0;
      const cfg = phases.find((p) => p.phaseNumber === phaseNumber);
      // Percentage first, then the flat amount, so "10% then €200 off" reads the way it is written.
      const pct = cfg?.discountPercent ? (subtotal * cfg.discountPercent) / 100 : 0;
      const flat = cfg?.discountAmount ?? 0;
      const discount = Math.min(subtotal, pct + flat);
      return {
        phaseNumber,
        name: cfg?.name ?? null,
        subtotal,
        discount,
        total: Math.max(0, subtotal - discount),
        healingPeriodMonths: cfg?.healingPeriodMonths ?? null,
      };
    });
}

export function computePlanTotal(items: PricedItem[], phases: PhaseDiscount[] = []): number {
  return computePhaseTotals(items, phases).reduce((sum, p) => sum + p.total, 0);
}
