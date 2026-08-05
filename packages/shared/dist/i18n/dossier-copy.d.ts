/**
 * The dossier's own words, in each language it is issued in.
 *
 * Scope, stated up front: this file holds *structural* copy — page titles, table headers, field
 * labels, the fixed furniture of the document. It deliberately does **not** hold clinical or
 * aftercare text.
 *
 * That separation is the point. A mistranslated column heading is embarrassing; a mistranslated
 * post-operative instruction is a safety incident. The clinical strings live in `aftercare.ts` and
 * `value-props.ts` and stay English until a person who speaks Arabic has read them and said so.
 * `DOSSIER_COPY.ar` being complete is not permission to ship the whole document in Arabic.
 */
export type DossierLocale = 'en' | 'ar';
export declare const DOSSIER_LOCALES: readonly DossierLocale[];
export declare function isRightToLeft(locale: string | null | undefined): boolean;
/** Every fixed string the dossier prints, keyed so a missing translation is a type error. */
export interface DossierCopy {
    treatmentPlan: string;
    preparedFor: string;
    preparedOn: string;
    planReference: string;
    patientDetails: string;
    name: string;
    dateOfBirth: string;
    nationality: string;
    contact: string;
    allergies: string;
    medicalNotes: string;
    noneRecorded: string;
    diagnosis: string;
    findings: string;
    tooth: string;
    condition: string;
    treatment: string;
    phase: string;
    procedure: string;
    material: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    subtotal: string;
    discount: string;
    total: string;
    healingPeriod: string;
    months: string;
    whyThisPlan: string;
    whatIsIncluded: string;
    payment: string;
    payableInCash: string;
    deposit: string;
    remainingOnArrival: string;
    byCard: string;
    cardSurcharge: string;
    paymentTerms: string;
    yourVisit: string;
    arrival: string;
    departure: string;
    nights: string;
    daySchedule: string;
    day: string;
    aftercare: string;
    viewOnline: string;
    scanToOpen: string;
    page: string;
    of: string;
}
export declare function dossierCopy(locale: string | null | undefined): DossierCopy;
/**
 * The style properties that mirror a layout, since react-pdf will not.
 *
 * `direction: 'rtl'` is accepted by the stylesheet and then discarded — it maps to
 * `processNoopValue`. Letter shaping and within-line bidi reordering *are* handled (fontkit and
 * bidi-js respectively), so the glyphs are right; only the block layout has to be mirrored by
 * hand. These helpers are that hand.
 */
export interface DirectionStyles {
    /** `right` for Arabic, so a paragraph starts at the correct margin. */
    readonly textAlign: 'left' | 'right';
    /** The opposite edge, for figures and values that sit against the far margin. */
    readonly textAlignOpposite: 'left' | 'right';
    /** Mirrors a horizontal row, which is what reverses table columns. */
    readonly flexDirection: 'row' | 'row-reverse';
    readonly isRtl: boolean;
}
export declare function directionStyles(locale: string | null | undefined): DirectionStyles;
//# sourceMappingURL=dossier-copy.d.ts.map