export interface CaseMoneyInput {
    /** Invoice totals raised against the patient. */
    invoiceTotals: number[];
    /** Only settled payments. A pending card authorisation is not money the clinic has. */
    completedPayments: number[];
    serviceCost?: number | null;
    salesCommission?: number | null;
}
export interface CaseEconomics {
    /** What the clinic has quoted and invoiced. */
    treatmentPrice: number;
    /** What has actually been received. */
    paid: number;
    /** Still owed. Never negative — an overpayment is shown separately rather than as a debt. */
    outstanding: number;
    /** Paid beyond the invoiced total, usually a deposit taken before invoicing. */
    overpaid: number;
    serviceCost: number;
    salesCommission: number;
    /**
     * Price minus what the case costs to deliver and what the salesperson takes.
     *
     * Computed from the invoiced price, not from what has been collected — profit on a case that is
     * half paid is still the profit, and using `paid` here would make every unfinished case look
     * like a loss.
     */
    netProfit: number;
    /** Net profit as a share of price. Null when nothing has been invoiced, since 0/0 is not 0%. */
    marginPercent: number | null;
}
export declare function computeCaseEconomics(input: CaseMoneyInput): CaseEconomics;
//# sourceMappingURL=case-economics.d.ts.map