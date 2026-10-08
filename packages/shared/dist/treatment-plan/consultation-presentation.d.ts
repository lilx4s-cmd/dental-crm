import { z } from 'zod';
import { type Consultation, type ConsultationLine, type DocumentConfiguration } from './consultation';
/** Patient-facing wording shared by the browser and printed proposal. */
declare const en: {
    estimate: string;
    toQuote: string;
    amount: string;
    visitFee: string;
    recorded: string;
    proposed: string;
    positionsPending: string;
    natural: string;
    naturalCrown: string;
    implantCrown: string;
    plannedExtraction: string;
    days: string;
    durationPending: string;
    nextSteps: string;
    nextStepText: string;
    healingText: string;
    separateVisits: string;
    surgicalPurpose: string;
    restorativePurpose: string;
    generalPurpose: string;
    cashTotal: string;
    cardTotal: string;
    cardExtra: string;
    depositRequested: string;
    remainingCash: string;
    remainingCard: string;
    quoteOnly: string;
    patientPreview: string;
    pdfPreview: string;
    openPdf: string;
    saveGenerate: string;
    refreshTreatment: string;
    prepared: string;
    reference: string;
    clinicalNote: string;
    discountReason: string;
};
export type ConsultationPresentationCopy = typeof en;
export declare function consultationPresentationCopy(language: Consultation['language']): ConsultationPresentationCopy;
/** Keep clinic colours readable even when a light accent is configured. */
export declare function consultationBrandPalette(colour?: string): {
    accent: string;
    onAccent: string;
    heading: string;
};
export interface ConsultationPaymentTerms {
    terms?: string | null;
    cardFee?: number | null;
    cashDiscount?: number | null;
    depositPercent?: number | null;
    depositAmount?: number | null;
}
export declare const ConsultationPaymentTermsSchema: z.ZodObject<{
    terms: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    cardFee: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    cashDiscount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    depositPercent: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    depositAmount: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    cardFee?: number | null | undefined;
    cashDiscount?: number | null | undefined;
    terms?: string | null | undefined;
    depositPercent?: number | null | undefined;
    depositAmount?: number | null | undefined;
}, {
    cardFee?: number | null | undefined;
    cashDiscount?: number | null | undefined;
    terms?: string | null | undefined;
    depositPercent?: number | null | undefined;
    depositAmount?: number | null | undefined;
}>;
/** Only these configured identity fields may be exposed on a public patient link. */
export type ConsultationIdentity = Pick<DocumentConfiguration, 'department' | 'representative' | 'accentColor' | 'signature' | 'stamp' | 'logo' | 'warranties'>;
export declare function consultationQuotedPayment(plan: Consultation, payment?: ConsultationPaymentTerms): import("./package-and-payment").PaymentSummary;
export declare function consultationVisitPurpose(plan: Consultation, visit: number): string;
/** The patient headline follows saved procedure quantities, including manual editor changes. */
export declare function consultationTreatmentSummary(plan: Consultation): string;
export declare function consultationVisitBreakdown(plan: Consultation, visit: number): {
    discount: number;
    subtotal: number;
    number: number;
    treatments: number;
    hotel: number;
    transfer: number;
    total: number;
    unpriced: boolean;
};
/** Applying edited text must not silently replace approved prices, positions or exceptions. */
export declare function preserveConsultationLineDetails(parsed: ConsultationLine[], saved: ConsultationLine[]): ConsultationLine[];
export {};
//# sourceMappingURL=consultation-presentation.d.ts.map