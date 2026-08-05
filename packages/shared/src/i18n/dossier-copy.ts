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

export const DOSSIER_LOCALES: readonly DossierLocale[] = ['en', 'ar'];

export function isRightToLeft(locale: string | null | undefined): boolean {
  return locale === 'ar';
}

/** Every fixed string the dossier prints, keyed so a missing translation is a type error. */
export interface DossierCopy {
  // Cover
  treatmentPlan: string;
  preparedFor: string;
  preparedOn: string;
  planReference: string;

  // Patient page
  patientDetails: string;
  name: string;
  dateOfBirth: string;
  nationality: string;
  contact: string;
  allergies: string;
  medicalNotes: string;
  noneRecorded: string;

  // Diagnoses
  diagnosis: string;
  findings: string;
  tooth: string;
  condition: string;

  // Treatment
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

  // Value
  whyThisPlan: string;

  // Package
  whatIsIncluded: string;

  // Payment
  payment: string;
  payableInCash: string;
  deposit: string;
  remainingOnArrival: string;
  byCard: string;
  cardSurcharge: string;
  paymentTerms: string;

  // Visit
  yourVisit: string;
  arrival: string;
  departure: string;
  nights: string;
  daySchedule: string;
  day: string;

  // Aftercare
  aftercare: string;
  viewOnline: string;
  scanToOpen: string;

  // Footer
  page: string;
  of: string;
}

const en: DossierCopy = {
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
const ar: DossierCopy = {
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

const COPY: Record<DossierLocale, DossierCopy> = { en, ar };

export function dossierCopy(locale: string | null | undefined): DossierCopy {
  return COPY[(locale as DossierLocale) ?? 'en'] ?? COPY.en;
}

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

export function directionStyles(locale: string | null | undefined): DirectionStyles {
  const rtl = isRightToLeft(locale);
  return {
    textAlign: rtl ? 'right' : 'left',
    textAlignOpposite: rtl ? 'left' : 'right',
    flexDirection: rtl ? 'row-reverse' : 'row',
    isRtl: rtl,
  };
}
