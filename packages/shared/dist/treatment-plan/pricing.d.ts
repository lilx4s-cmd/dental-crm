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
export declare function phaseOf(item: PricedItem): number;
export declare function computePhaseTotals(items: PricedItem[], phases?: PhaseDiscount[]): PhaseTotal[];
export declare function computePlanTotal(items: PricedItem[], phases?: PhaseDiscount[]): number;
//# sourceMappingURL=pricing.d.ts.map