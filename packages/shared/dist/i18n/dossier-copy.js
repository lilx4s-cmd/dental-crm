"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOSSIER_LOCALES = void 0;
exports.isRightToLeft = isRightToLeft;
exports.dossierCopy = dossierCopy;
exports.directionStyles = directionStyles;
exports.DOSSIER_LOCALES = ['en', 'ar'];
function isRightToLeft(locale) {
    return locale === 'ar';
}
const en = {
    treatmentPlan: 'Treatment Plan',
    preparedFor: 'Prepared for',
    preparedOn: 'Prepared on',
    planReference: 'Plan reference',
    patientDetails: 'Patient details',
    name: 'Name',
    dateOfBirth: 'Date of birth',
    nationality: 'Nationality',
    contact: 'Contact',
    allergies: 'Allergies',
    medicalNotes: 'Medical notes',
    noneRecorded: 'None recorded',
    diagnosis: 'Diagnosis',
    findings: 'Findings',
    tooth: 'Tooth',
    condition: 'Condition',
    treatment: 'Treatment',
    phase: 'Phase',
    procedure: 'Procedure',
    material: 'Material',
    quantity: 'Qty',
    unitPrice: 'Unit price',
    lineTotal: 'Total',
    subtotal: 'Subtotal',
    discount: 'Discount',
    total: 'Total',
    healingPeriod: 'Healing period',
    months: 'months',
    whyThisPlan: 'Why this plan',
    whatIsIncluded: "What's included",
    payment: 'Payment',
    payableInCash: 'Payable in cash',
    deposit: 'Deposit',
    remainingOnArrival: 'Remaining on arrival',
    byCard: 'By card',
    cardSurcharge: 'Card surcharge',
    paymentTerms: 'Payment terms',
    yourVisit: 'Your visit',
    arrival: 'Arrival',
    departure: 'Departure',
    nights: 'nights',
    daySchedule: 'Day by day',
    day: 'Day',
    aftercare: 'Aftercare',
    viewOnline: 'View online',
    scanToOpen: 'Scan to open your plan',
    page: 'Page',
    of: 'of',
};
/**
 * Arabic — Modern Standard, as used in clinical paperwork across the Gulf.
 *
 * Reviewed for register rather than only for meaning: `خطة العلاج` is what a clinic writes, not the
 * more literal `خطة المعالجة`. Numbers stay Western (٠-٩ are not used in Gulf medical billing), and
 * bidi-js reorders them correctly inside an Arabic line.
 */
const ar = {
    treatmentPlan: 'خطة العلاج',
    preparedFor: 'أُعدت لـ',
    preparedOn: 'تاريخ الإعداد',
    planReference: 'رقم الخطة',
    patientDetails: 'بيانات المريض',
    name: 'الاسم',
    dateOfBirth: 'تاريخ الميلاد',
    nationality: 'الجنسية',
    contact: 'وسيلة التواصل',
    allergies: 'الحساسية',
    medicalNotes: 'ملاحظات طبية',
    noneRecorded: 'لا يوجد',
    diagnosis: 'التشخيص',
    findings: 'النتائج',
    tooth: 'السن',
    condition: 'الحالة',
    treatment: 'العلاج',
    phase: 'المرحلة',
    procedure: 'الإجراء',
    material: 'المادة',
    quantity: 'العدد',
    unitPrice: 'سعر الوحدة',
    lineTotal: 'الإجمالي',
    subtotal: 'المجموع الفرعي',
    discount: 'الخصم',
    total: 'الإجمالي',
    healingPeriod: 'فترة الالتئام',
    months: 'أشهر',
    whyThisPlan: 'لماذا هذه الخطة',
    whatIsIncluded: 'ما يشمله السعر',
    payment: 'الدفع',
    payableInCash: 'المبلغ نقداً',
    deposit: 'العربون',
    remainingOnArrival: 'المتبقي عند الوصول',
    byCard: 'بالبطاقة',
    cardSurcharge: 'رسوم البطاقة',
    paymentTerms: 'شروط الدفع',
    yourVisit: 'زيارتك',
    arrival: 'الوصول',
    departure: 'المغادرة',
    nights: 'ليالٍ',
    daySchedule: 'البرنامج اليومي',
    day: 'اليوم',
    aftercare: 'العناية بعد العلاج',
    viewOnline: 'عرض على الإنترنت',
    scanToOpen: 'امسح الرمز لفتح خطتك',
    page: 'صفحة',
    of: 'من',
};
const COPY = { en, ar };
function dossierCopy(locale) {
    return COPY[locale ?? 'en'] ?? COPY.en;
}
function directionStyles(locale) {
    const rtl = isRightToLeft(locale);
    return {
        textAlign: rtl ? 'right' : 'left',
        textAlignOpposite: rtl ? 'left' : 'right',
        flexDirection: rtl ? 'row-reverse' : 'row',
        isRtl: rtl,
    };
}
//# sourceMappingURL=dossier-copy.js.map