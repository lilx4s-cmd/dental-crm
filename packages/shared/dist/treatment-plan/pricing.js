"use strict";
// Treatment plans are priced in phases: each phase totals its own line items, then takes its own
// discount, and the plan total is the sum of what is left. This lives in the shared package because
// three places have to agree on the number — the API when it persists TreatmentPlan.totalCost, the
// builder while staff are still typing, and the PDF the patient is handed. Any drift between them
// is a quote the clinic cannot stand behind, so there is deliberately only one implementation.
Object.defineProperty(exports, "__esModule", { value: true });
exports.phaseOf = phaseOf;
exports.computePhaseTotals = computePhaseTotals;
exports.computePlanTotal = computePlanTotal;
/** Items with no phase set belong to phase 1 — the common case of a plan done in one go. */
function phaseOf(item) {
    return item.phaseNumber && item.phaseNumber > 0 ? item.phaseNumber : 1;
}
function computePhaseTotals(items, phases = []) {
    const subtotals = new Map();
    for (const item of items) {
        const p = phaseOf(item);
        subtotals.set(p, (subtotals.get(p) ?? 0) + item.cost);
    }
    // A phase can carry a discount or a healing period without holding any line items of its own,
    // so phases named by the caller are included even when nothing sums into them.
    for (const p of phases)
        if (!subtotals.has(p.phaseNumber))
            subtotals.set(p.phaseNumber, 0);
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
function computePlanTotal(items, phases = []) {
    return computePhaseTotals(items, phases).reduce((sum, p) => sum + p.total, 0);
}
//# sourceMappingURL=pricing.js.map