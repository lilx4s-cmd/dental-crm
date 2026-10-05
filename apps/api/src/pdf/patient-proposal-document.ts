import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import React from 'react';
import {
  computePhaseTotals, computePaymentSummary, packageInclusionDef, parseToothNumbers,
  conditionFromText, TOOTH_CONDITION_LABELS, aftercareFor, type ToothCondition,
} from '@dental-crm/shared';
import type { ClinicBranding, PlanDocumentInput } from './treatment-plan-document';
import { DentalChartPdf } from './dental-chart-pdf';

const el = React.createElement;
const n = (value: unknown): number => value == null ? 0 : Number(String(value));
const date = (value?: Date | string | null): string => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};
const money = (amount: number, currency: string) =>
  currency + ' ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const s = StyleSheet.create({
  page: { paddingHorizontal: 44, paddingTop: 38, paddingBottom: 54, fontFamily: 'Helvetica', fontSize: 10, color: '#183048' },
  clinic: { fontFamily: 'Helvetica-Bold', fontSize: 14, letterSpacing: 0.5 },
  contact: { color: '#576878', fontSize: 8, lineHeight: 1.3, marginTop: 4, marginBottom: 16 },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 23, lineHeight: 1.15, marginBottom: 8 },
  subtitle: { fontSize: 11, color: '#576878', marginBottom: 14 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, backgroundColor: '#F2F6FA', marginBottom: 14 },
  field: { width: '50%', fontSize: 9, marginBottom: 4, paddingRight: 8 },
  total: { backgroundColor: '#183858', padding: 14, marginBottom: 14 },
  totalLabel: { color: '#DDEAF5', fontSize: 8, marginBottom: 3 },
  totalValue: { color: '#FFFFFF', fontFamily: 'Helvetica-Bold', fontSize: 22 },
  totalNote: { color: '#DDEAF5', fontSize: 8, lineHeight: 1.3, marginTop: 7 },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 13, marginTop: 9, marginBottom: 5 },
  p: { fontSize: 9.5, lineHeight: 1.35, color: '#374B5F', marginBottom: 6 },
  visit: { borderTopWidth: 1, borderTopColor: '#CAD7E3', marginTop: 12, paddingTop: 8 },
  visitTitle: { fontFamily: 'Helvetica-Bold', fontSize: 12, marginBottom: 7 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#E5ECF2', paddingVertical: 6 },
  description: { width: '65%', paddingRight: 10, fontSize: 9 },
  qty: { width: '10%', textAlign: 'center', fontSize: 9 },
  price: { width: '25%', textAlign: 'right', fontSize: 9 },
  small: { fontSize: 8, lineHeight: 1.3, color: '#576878', marginTop: 3 },
  bold: { fontFamily: 'Helvetica-Bold' },
  note: { backgroundColor: '#F2F6FA', padding: 10, marginVertical: 10 },
  bullet: { fontSize: 9.5, lineHeight: 1.35, color: '#374B5F', marginBottom: 5 },
  footer: { position: 'absolute', bottom: 24, left: 44, right: 44, height: 12, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: '#576878' },
  qr: { width: 65, height: 65, marginRight: 14 },
  qrRow: { flexDirection: 'row', marginTop: 12, alignItems: 'center' },
});

function header(branding: ClinicBranding) {
  return el(View, { wrap: false },
    el(Text, { style: s.clinic }, branding.clinicName.toUpperCase()),
    el(Text, { style: s.contact }, [
      [branding.address, branding.city, branding.country].filter(Boolean).join(', '),
      [branding.phone, branding.email, branding.website].filter(Boolean).join(' | '),
    ].filter(Boolean).join('\n')),
  );
}
function footer(branding: ClinicBranding) {
  return el(View, { style: s.footer, fixed: true },
    el(Text, { style: { fontSize: 7.5, lineHeight: 1.2 } }, branding.clinicName + ' | International Patient Department'),
    el(Text, { style: { width: 45, height: 12, fontSize: 7.5, lineHeight: 1.2, textAlign: 'right' }, render: ({ pageNumber, totalPages }) => pageNumber + ' / ' + totalPages }, ' '),
  );
}
function section(title: string, text: string, key: string) {
  return el(View, { key, wrap: text.length > 700 }, el(Text, { style: s.h2, minPresenceAhead: 30 }, title), el(Text, { style: s.p }, text));
}
function clinicalNote() {
  return section('Clinical confirmation',
    'The treating dentist confirms suitability, positions, materials and sequence after examination and indicated imaging. Healing and treatment times vary by patient. Changes in scope or price will be discussed before treatment.',
    'confirmation');
}

/** Concise, patient-facing quotation using the same prices as the CRM and the patient portal. */
export function TreatmentPlanDocument(plan: PlanDocumentInput, branding: ClinicBranding, qrDataUrl?: string, portalUrl?: string) {
  const totals = computePhaseTotals(
    plan.items.map(item => ({ cost: n(item.cost), phaseNumber: item.phaseNumber })),
    (plan.phases ?? []).map(phase => ({ ...phase, discountAmount: n(phase.discountAmount), discountPercent: n(phase.discountPercent) })),
  );
  const total = totals.reduce((sum, phase) => sum + phase.total, 0);
  const unpriced = plan.items.length === 0 || plan.items.some(item => item.unitPrice == null && n(item.cost) === 0);
  const conditions = new Set<ToothCondition>();
  for (const item of plan.items) {
    const condition = item.toothCondition ?? conditionFromText(item.treatmentCategory?.name, item.description);
    if (condition) conditions.add(condition);
  }
  const patientName = [plan.patient.firstName, plan.patient.lastName].filter(Boolean).join(' ');
  const age = plan.patient.dateOfBirth ? (() => {
    const born = new Date(plan.patient.dateOfBirth);
    const today = new Date(plan.createdAt ?? Date.now());
    const years = today.getUTCFullYear() - born.getUTCFullYear() -
      (today.getUTCMonth() < born.getUTCMonth() || (today.getUTCMonth() === born.getUTCMonth() && today.getUTCDate() < born.getUTCDate()) ? 1 : 0);
    return Number.isFinite(years) && years >= 0 ? String(years) : '';
  })() : '';
  const meta = [
    'Patient: ' + patientName,
    'Prepared: ' + (date(plan.createdAt) || date(new Date())),
    age ? 'Age: ' + age + ' years' : '',
    plan.assignedDentist ? 'Dentist: Dr. ' + plan.assignedDentist.firstName + ' ' + plan.assignedDentist.lastName : '',
    plan.assignedCoordinator ? 'Coordinator: ' + plan.assignedCoordinator.firstName + ' ' + plan.assignedCoordinator.lastName : '',
  ].filter(Boolean);
  const visitBlocks = totals.map((phase, index) => {
    const items = plan.items.filter(item => (item.phaseNumber || 1) === phase.phaseNumber);
    const phaseUnpriced = items.some(item => item.unitPrice == null && n(item.cost) === 0);
    return el(View, { key: 'visit-' + phase.phaseNumber, style: s.visit },
      el(Text, { style: s.visitTitle, minPresenceAhead: 70 }, 'Visit ' + (index + 1) + (phase.name ? ' - ' + phase.name : '')),
      el(View, { style: s.row, wrap: false },
        el(Text, { style: [s.description, s.bold] }, 'Treatment'),
        el(Text, { style: [s.qty, s.bold] }, 'Units'),
        el(Text, { style: [s.price, s.bold] }, 'Amount'),
      ),
      ...items.map((item, row) => {
        const teeth = parseToothNumbers(item.toothNumber);
        const upper = teeth.filter(tooth => ['1', '2'].includes(tooth[0])).length;
        const lower = teeth.filter(tooth => ['3', '4'].includes(tooth[0])).length;
        const distribution = teeth.length > 0 ? [upper ? upper + ' upper' : '', lower ? lower + ' lower' : ''].filter(Boolean).join(' / ') : '';
        const amount = n(item.cost) > 0 ? money(n(item.cost), plan.currency) : item.unitPrice == null ? 'To be quoted' : 'Included';
        return el(View, { style: s.row, key: 'item-' + row, wrap: (item.description.length + (item.clinicalNotes?.length ?? 0)) > 1000 },
          el(View, { style: { width: '65%', paddingRight: 10 } },
            el(Text, { style: { fontSize: 9 } }, item.description),
            [item.material, item.brand, distribution].filter(Boolean).length > 0
              ? el(Text, { style: s.small }, [item.material, item.brand, distribution].filter(Boolean).join(' | ')) : null,
            item.clinicalNotes ? el(Text, { style: s.small }, item.clinicalNotes) : null,
          ),
          el(Text, { style: s.qty }, String(item.quantity)),
          el(Text, { style: s.price }, amount),
        );
      }),
      phase.discount > 0 ? el(Text, { style: s.small }, 'Visit discount: -' + money(phase.discount, plan.currency)) : null,
      el(Text, { style: [s.p, s.bold], wrap: false }, 'Visit ' + (index + 1) + (phaseUnpriced ? ' provisional subtotal: ' : ' fee: ') + (phaseUnpriced && phase.total === 0 ? 'To be confirmed' : money(phase.total, plan.currency))),
      phase.healingPeriodMonths && index < totals.length - 1
        ? el(View, { style: s.note, wrap: false }, el(Text, { style: s.p },
          'Healing before the next visit: approximately ' + phase.healingPeriodMonths + ' months. Return only after the dentist confirms that healing and implant stability allow the next stage.')) : null,
    );
  });
  const first = el(Page, { size: 'A4', style: s.page, key: 'proposal' },
    header(branding),
    el(Text, { style: s.title }, 'Personalized Dental Treatment Plan'),
    el(Text, { style: s.subtitle }, plan.title),
    el(View, { style: s.meta, wrap: false }, ...meta.map((text, index) => el(Text, { style: s.field, key: 'meta-' + index }, text))),
    el(View, { style: s.total, wrap: false },
      el(Text, { style: s.totalLabel }, unpriced ? 'PROVISIONAL QUOTE - PRICES STILL TO BE CONFIRMED' : 'TOTAL TREATMENT PRICE'),
      el(Text, { style: s.totalValue }, unpriced && total === 0 ? 'Price to be confirmed' : money(total, plan.currency)),
      el(Text, { style: s.totalNote }, unpriced ? 'This subtotal includes priced procedures only. Unpriced procedures require confirmation.' : totals.length > 1
        ? 'Each visit is priced separately below. The total covers all listed treatment stages.'
        : 'The price covers the treatment listed below.'),
    ),
    plan.doctorRecommendation ? section('Your treatment objective', plan.doctorRecommendation, 'objective') : null,
    ...visitBlocks,
    totals.length > 1 ? section('Separate visits and payments',
      'The listed visits are priced separately. Fees for later visits are separate from the first-visit fee. Any deposit and payment schedule are shown in the payment terms.',
      'separate-payments') : null,
    footer(branding),
  );
  const payment = computePaymentSummary({ total, depositAmount: n(plan.depositAmount), cardFeePercent: n(plan.cardFeePercent), cashDiscountPercent: n(plan.cashDiscountPercent) });
  const included = (plan.packageIncludes ?? []).map(packageInclusionDef).filter((item): item is NonNullable<typeof item> => !!item);
  const second = el(Page, { size: 'A4', style: s.page, key: 'details' },
    header(branding),
    el(Text, { style: s.title }, 'Your Package & Next Steps'),
    el(Text, { style: s.subtitle }, patientName + ' | ' + plan.title),
    el(Text, { style: s.h2 }, 'Included in your quoted package'),
    included.length > 0
      ? el(View, {}, ...included.map(item => el(Text, { style: s.bullet, key: item.key }, '- ' + item.label)))
      : el(Text, { style: s.p }, 'Only the listed dental procedures are quoted. Hotel, transport and other services are included only when explicitly confirmed.'),
    included.some(item => item.key === 'HOTEL') && plan.stay?.nights
      ? el(Text, { style: s.p }, 'Hotel: ' + plan.stay.nights + ' nights' + (plan.stay.hotelName ? ' at ' + plan.stay.hotelName : '') + '.') : null,
    el(Text, { style: s.small }, 'Any treatment or travel service outside this proposal requires a separate agreement.'),
    el(Text, { style: s.h2 }, 'Financial summary'),
    ...totals.map((phase, index) => el(View, { style: s.row, wrap: false, key: 'payment-' + index },
      el(Text, { style: { width: '70%', fontSize: 9 } }, 'Visit ' + (index + 1) + (phase.name ? ' - ' + phase.name : '') + (plan.items.some(item => (item.phaseNumber || 1) === phase.phaseNumber && item.unitPrice == null && n(item.cost) === 0) ? ' (provisional)' : '')),
      el(Text, { style: { width: '30%', textAlign: 'right', fontSize: 9 } }, unpriced && phase.total === 0 ? 'To be confirmed' : money(phase.total, plan.currency)),
    )),
    total > 0 ? el(View, { style: s.note, wrap: false },
      el(Text, { style: [s.p, s.bold] }, (unpriced ? 'Confirmed subtotal: ' : 'Treatment total: ') + money(payment.total, plan.currency)),
      plan.cashDiscountPercent != null ? el(Text, { style: s.p }, 'Cash payment: ' + money(payment.cashTotal, plan.currency) +
        (payment.cashDiscountPercent > 0 ? ' (' + payment.cashDiscountPercent + '% cash discount)' : ' (no card surcharge)')) : null,
      plan.cardFeePercent != null ? el(Text, { style: s.p }, 'Card payment: ' + money(payment.cardTotal, plan.currency) +
        (payment.cardFeePercent > 0 ? ' (' + payment.cardFeePercent + '% surcharge; additional ' + money(payment.cardExtra, plan.currency) + ')' : ' (no card surcharge)')) : null,
      payment.deposit > 0 ? el(Text, { style: s.p }, 'Deposit: ' + money(payment.deposit, plan.currency) + '. Remaining across the planned visits: ' + money(payment.remaining, plan.currency) + '.') : null,
    ) : null,
    plan.paymentTerms ? section('Payment terms', plan.paymentTerms, 'terms') : null,
    plan.flightRefundNote ? section('Flight arrangement', plan.flightRefundNote, 'flight') : null,
    section('How we plan your treatment',
      'Your dentist reviews the assessment and treatment scope with you. For final restorations, shape, shade and bite are checked before definitive fitting. The specified materials and brands are recorded with your treatment.',
      'process'),
    included.some(item => item.key === 'WARRANTY') ? section('Warranty and follow-up',
      'Your written certificate confirms coverage, duration, maintenance requirements and exclusions. Confirm these terms with your coordinator before treatment and keep the certificate.',
      'warranty') : null,
    clinicalNote(),
    section('Your next step', 'Confirm the plan, visit dates, package coverage and payment schedule with your coordinator before booking. The treating team provides your individual care instructions.', 'next'),
    qrDataUrl && portalUrl ? el(View, { style: s.qrRow, wrap: false },
      el(Image, { src: qrDataUrl, style: s.qr }),
      el(View, { style: { flex: 1 } }, el(Text, { style: s.p }, 'View your plan online and ask your coordinator a question.'), el(Text, { style: s.small }, portalUrl)),
    ) : null,
    footer(branding),
  );

  const pages = [first, second];
  // Keep the existing clinical chart, itinerary and aftercare capabilities as useful appendices.
  if ((plan.diagnoses ?? []).length > 0) {
    const current: Record<string, ToothCondition> = {};
    const proposed: Record<string, ToothCondition> = {};
    for (const finding of plan.diagnoses ?? []) for (const tooth of finding.toothNumbers) {
      current[tooth] = finding.condition;
      if (finding.condition === 'MISSING') proposed[tooth] = 'MISSING';
    }
    for (const item of plan.items) {
      const condition = item.toothCondition ?? conditionFromText(item.treatmentCategory?.name, item.description);
      if (condition) for (const tooth of parseToothNumbers(item.toothNumber)) proposed[tooth] = condition;
    }
    pages.push(el(Page, { size: 'A4', style: s.page, key: 'chart' },
      header(branding), el(Text, { style: s.title }, 'Your Dental Assessment'),
      el(Text, { style: s.h2 }, 'Recorded findings'),
      ...plan.diagnoses!.map((finding, index) => el(Text, { style: s.p, key: 'finding-' + index },
        TOOTH_CONDITION_LABELS[finding.condition] + ': ' + finding.toothNumbers.join(', ') + (finding.notes ? ' - ' + finding.notes : ''))),
      el(DentalChartPdf, { conditions: current, mode: 'diagnosis', width: 507 }),
      el(Text, { style: s.h2 }, 'Proposed treatment positions'),
      el(DentalChartPdf, { conditions: proposed, mode: 'plan', width: 507 }),
      clinicalNote(), footer(branding),
    ));
  }
  const stay = plan.stay;
  const travel = [
    stay?.arrivalDate ? 'Arrival: ' + date(stay.arrivalDate) + (stay.arrivalFlight ? ' | ' + stay.arrivalFlight : '') : '',
    stay?.departureDate ? 'Departure: ' + date(stay.departureDate) + (stay.departureFlight ? ' | ' + stay.departureFlight : '') : '',
    stay?.hotelName ? 'Hotel: ' + stay.hotelName : '',
    stay?.hotelAddress ? 'Hotel address: ' + stay.hotelAddress : '',
    stay?.roomType ? 'Room: ' + stay.roomType : '',
    stay?.nights != null ? 'Nights: ' + stay.nights : '',
    stay?.companions != null ? 'Companions: ' + stay.companions : '',
    stay?.checkInDate ? 'Check-in: ' + date(stay.checkInDate) : '',
    stay?.checkOutDate ? 'Check-out: ' + date(stay.checkOutDate) : '',
    stay?.airportTransfer ? 'Airport transfer: ' + stay.airportTransfer : '',
    stay?.clinicTransfer ? 'Clinic transfer: ' + stay.clinicTransfer : '',
    stay?.notes ?? '',
  ].filter(Boolean);
  if (travel.length || plan.scheduleItems?.length) pages.push(el(Page, { size: 'A4', style: s.page, key: 'travel' },
    header(branding), el(Text, { style: s.title }, 'Your Stay & Appointments'),
    ...travel.map((text, index) => el(Text, { style: s.p, key: 'travel-' + index }, text)),
    ...(plan.scheduleItems ?? []).map((item, index) => section(date(item.date) + (item.time ? ' | ' + item.time : '') + ' - ' + item.title,
      [item.location, item.notes].filter(Boolean).join(' | '), 'appointment-' + index)),
    footer(branding),
  ));
  const aftercare = aftercareFor(conditions);
  if (aftercare.length) pages.push(el(Page, { size: 'A4', style: s.page, key: 'aftercare' },
    header(branding), el(Text, { style: s.title }, 'Aftercare & Support'),
    el(Text, { style: s.p }, 'General guidance for the procedures in your plan. Follow the individual instructions your treating dentist gives you.'),
    ...aftercare.map((item, index) => el(View, { key: 'aftercare-' + index },
      el(Text, { style: s.h2, minPresenceAhead: 60 }, item.title),
      ...item.aftercare.map((text, bullet) => el(Text, { style: s.bullet, key: 'bullet-' + bullet }, '- ' + text)),
      item.warningSigns?.length ? el(Text, { style: [s.p, s.bold], minPresenceAhead: 30 }, 'Contact the clinic promptly if you notice:') : null,
      ...(item.warningSigns ?? []).map((text, warning) => el(Text, { style: s.bullet, key: 'warning-' + warning }, '- ' + text)),
    )),
    footer(branding),
  ));
  return el(Document, { title: plan.title + ' - ' + patientName, author: branding.clinicName }, ...pages);
}
