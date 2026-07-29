/**
 * What the price includes, and what it costs to pay it.
 *
 * Both were on the clinic's Word quotation and in nobody's database: the package ("hotel,
 * medication, X-rays and all aftercare — no hidden fees") is the strongest paragraph on that
 * document, and the payment terms are a commercial position that a coordinator was retyping into
 * every proposal by hand. Retyped terms eventually disagree with each other, and the version a
 * patient can point at is whichever one they were sent.
 *
 * Pure logic, shared, because the editor previews the same arithmetic the dossier prints. Two
 * implementations of a card surcharge is two answers to "what do I actually owe you".
 */
export declare const PackageInclusion: {
    readonly AIRPORT_TRANSFER: "AIRPORT_TRANSFER";
    readonly HOTEL: "HOTEL";
    readonly VIP_TRANSPORT: "VIP_TRANSPORT";
    readonly MEDICATION: "MEDICATION";
    readonly PANORAMIC_XRAY: "PANORAMIC_XRAY";
    readonly CT_SCAN: "CT_SCAN";
    readonly TRANSLATOR: "TRANSLATOR";
    readonly AFTERCARE: "AFTERCARE";
    readonly WARRANTY: "WARRANTY";
    readonly FOLLOW_UP: "FOLLOW_UP";
};
export type PackageInclusion = (typeof PackageInclusion)[keyof typeof PackageInclusion];
export interface PackageInclusionDef {
    key: PackageInclusion;
    label: string;
    /** One line on the dossier. Says what the patient gets, not what the clinic provides. */
    detail: string;
}
/**
 * Ordered as a patient experiences the trip — landing, sleeping, being driven, being treated,
 * going home — rather than alphabetically or by what the clinic considers most valuable.
 */
export declare const PACKAGE_INCLUSIONS: PackageInclusionDef[];
export declare function packageInclusionDef(key: string): PackageInclusionDef | undefined;
export interface PaymentInput {
    /** The plan total, before any payment-method adjustment. */
    total: number;
    /** A fixed amount rather than a percentage — what the clinic actually asks to hold the date. */
    depositAmount?: number | null;
    /** Charged by the processor on international cards, passed through to the patient. */
    cardFeePercent?: number | null;
    /** Taken off for paying in cash, which costs the clinic nothing to accept. */
    cashDiscountPercent?: number | null;
}
export interface PaymentSummary {
    total: number;
    /** Payable in cash, after any cash discount. */
    cashTotal: number;
    /** Payable by card, after the processor's surcharge. */
    cardTotal: number;
    /** What paying by card costs over paying cash. The number that changes behaviour. */
    cardExtra: number;
    deposit: number;
    /** Against the cash price, which is the one the plan is quoted at. */
    remaining: number;
    cashDiscountPercent: number;
    cardFeePercent: number;
}
/**
 * What the patient owes, by payment method.
 *
 * The cash price is the headline: it is what the plan is quoted at and what the discount produces.
 * The card price is the cash price plus the processor's fee, because that is the order the charge
 * actually happens in — applying the surcharge to a pre-discount figure would overstate it and
 * hand the patient a number the clinic cannot reconcile.
 *
 * A deposit larger than the balance is clamped rather than producing a negative remainder: a plan
 * whose deposit exceeds its total is a data-entry mistake, and printing "remaining: -400" invites
 * an argument at the desk.
 */
export declare function computePaymentSummary(input: PaymentInput): PaymentSummary;
//# sourceMappingURL=package-and-payment.d.ts.map