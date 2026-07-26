"use strict";
// What a case is worth and what it cost, derived in one place.
//
// Only two of these figures are ever stored — the service cost and the sales commission, which
// somebody types in. Price and paid come from the invoices and payments that already exist, and
// profit is computed. Storing a derived total is how a patient ends up with two different answers
// to "how much have they paid", one of which is stale.
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCaseEconomics = computeCaseEconomics;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
function computeCaseEconomics(input) {
    const treatmentPrice = sum(input.invoiceTotals);
    const paid = sum(input.completedPayments);
    const serviceCost = input.serviceCost ?? 0;
    const salesCommission = input.salesCommission ?? 0;
    const balance = treatmentPrice - paid;
    const netProfit = treatmentPrice - serviceCost - salesCommission;
    return {
        treatmentPrice,
        paid,
        outstanding: Math.max(0, balance),
        overpaid: Math.max(0, -balance),
        serviceCost,
        salesCommission,
        netProfit,
        marginPercent: treatmentPrice > 0 ? (netProfit / treatmentPrice) * 100 : null,
    };
}
//# sourceMappingURL=case-economics.js.map