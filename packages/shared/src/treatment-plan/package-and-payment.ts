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

export const PackageInclusion = {
  AIRPORT_TRANSFER: 'AIRPORT_TRANSFER',
  HOTEL: 'HOTEL',
  VIP_TRANSPORT: 'VIP_TRANSPORT',
  MEDICATION: 'MEDICATION',
  PANORAMIC_XRAY: 'PANORAMIC_XRAY',
  CT_SCAN: 'CT_SCAN',
  TRANSLATOR: 'TRANSLATOR',
  AFTERCARE: 'AFTERCARE',
  WARRANTY: 'WARRANTY',
  FOLLOW_UP: 'FOLLOW_UP',
} as const;
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
export const PACKAGE_INCLUSIONS: PackageInclusionDef[] = [
  {
    key: 'AIRPORT_TRANSFER',
    label: 'Airport transfer',
    detail: 'Met at arrivals and driven to your hotel, and taken back for your return flight.',
  },
  {
    key: 'HOTEL',
    label: 'Hotel accommodation',
    detail: 'Your stay for the nights of treatment, booked and paid for by the clinic.',
  },
  {
    key: 'VIP_TRANSPORT',
    label: 'VIP transport',
    detail: 'A private car between your hotel and the clinic for every appointment.',
  },
  {
    key: 'MEDICATION',
    label: 'Medication',
    detail: 'Antibiotics, painkillers and mouthwash for your recovery, supplied by the clinic.',
  },
  {
    key: 'PANORAMIC_XRAY',
    label: 'Panoramic X-ray',
    detail: 'A full-jaw radiograph taken on arrival, included rather than billed separately.',
  },
  {
    key: 'CT_SCAN',
    label: '3D CT scan',
    detail: 'Three-dimensional imaging of the jaw, used to plan implant position and depth.',
  },
  {
    key: 'TRANSLATOR',
    label: 'Translator',
    detail: 'Someone with you in your own language for every clinical conversation.',
  },
  {
    key: 'AFTERCARE',
    label: 'Aftercare',
    detail: 'Written instructions, and a number you can reach after you fly home.',
  },
  {
    key: 'WARRANTY',
    label: 'Warranty',
    detail: 'A written guarantee on the work, issued as a certificate in your name.',
  },
  {
    key: 'FOLLOW_UP',
    label: 'Follow-up',
    detail: 'Scheduled check-ins after treatment to confirm everything has settled.',
  },
];

export function packageInclusionDef(key: string): PackageInclusionDef | undefined {
  return PACKAGE_INCLUSIONS.find((p) => p.key === key);
}

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

/** Rounds money to whole cents, so a percentage never prints as 3499.9999999996. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
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
export function computePaymentSummary(input: PaymentInput): PaymentSummary {
  const total = Math.max(0, input.total || 0);
  const cashDiscountPercent = Math.max(0, input.cashDiscountPercent ?? 0);
  const cardFeePercent = Math.max(0, input.cardFeePercent ?? 0);

  const cashTotal = money(total * (1 - cashDiscountPercent / 100));
  const cardTotal = money(cashTotal * (1 + cardFeePercent / 100));
  const deposit = Math.min(money(Math.max(0, input.depositAmount ?? 0)), cashTotal);

  return {
    total: money(total),
    cashTotal,
    cardTotal,
    cardExtra: money(cardTotal - cashTotal),
    deposit,
    remaining: money(cashTotal - deposit),
    cashDiscountPercent,
    cardFeePercent,
  };
}
