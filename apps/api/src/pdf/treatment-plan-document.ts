import { Document, Page, Text, View, StyleSheet, Image, Svg, Path } from '@react-pdf/renderer';
import React from 'react';
import {
  AFTERCARE_SECTIONS,
  TOOTH_CONDITION_LABELS,
  TRAVEL_GUIDANCE,
  aftercareFor,
  computePhaseTotals,
  conditionFromText,
  parseToothNumbers,
  type ToothCondition,
} from '@dental-crm/shared';

import { DentalChartPdf } from './dental-chart-pdf';

// A4 at 72dpi is 595x842pt; 40pt margins leave 515pt of usable width for the charts and tables.
const CONTENT_WIDTH = 515;

const s = StyleSheet.create({
  page: { paddingHorizontal: 40, paddingTop: 40, paddingBottom: 56, fontSize: 10, fontFamily: 'Helvetica', color: '#18181b' },
  coverPage: { padding: 0, fontSize: 10, fontFamily: 'Helvetica', color: '#18181b' },

  coverBand: { backgroundColor: '#0f766e', paddingHorizontal: 48, paddingVertical: 56 },
  coverClinic: { fontSize: 13, color: '#ccfbf1', letterSpacing: 2, fontFamily: 'Helvetica-Bold' },
  coverTitle: { fontSize: 40, color: '#ffffff', marginTop: 18, fontFamily: 'Helvetica-Bold' },
  coverSubtitle: { fontSize: 13, color: '#99f6e4', marginTop: 8 },
  coverBody: { paddingHorizontal: 48, paddingTop: 44 },
  coverLabel: { fontSize: 9, color: '#71717a', letterSpacing: 1, marginBottom: 3 },
  coverValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 22 },
  coverFooter: { position: 'absolute', bottom: 40, left: 48, right: 48, fontSize: 8, color: '#a1a1aa' },

  h1: { fontSize: 19, fontFamily: 'Helvetica-Bold' },
  h2: { fontSize: 11, color: '#52525b', marginTop: 3, marginBottom: 14 },
  sectionTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 18, marginBottom: 8 },

  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  field: { width: '50%', marginBottom: 14 },
  fieldLabel: { fontSize: 9, color: '#0f766e', marginBottom: 2 },
  fieldValue: { fontSize: 12 },

  card: { borderWidth: 1, borderColor: '#e4e4e7', borderRadius: 4, padding: 10, marginBottom: 8 },
  cardLabel: { fontSize: 9, color: '#71717a', fontFamily: 'Helvetica-Bold', marginBottom: 4 },

  table: { borderWidth: 1, borderColor: '#e4e4e7', borderRadius: 4, marginTop: 10 },
  thead: { flexDirection: 'row', backgroundColor: '#0f766e', paddingVertical: 6, paddingHorizontal: 8 },
  th: { color: '#ffffff', fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  tr: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#f4f4f5' },
  trPhase: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#e4e4e7', backgroundColor: '#f4f4f5' },
  trTotal: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8, borderTopWidth: 2, borderTopColor: '#0f766e' },
  td: { fontSize: 9.5 },
  bold: { fontFamily: 'Helvetica-Bold' },
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },

  chartWrap: { marginTop: 8, marginBottom: 4 },
  qrBlock: { alignItems: 'center', marginTop: 40 },
  qr: { width: 190, height: 190 },
  qrCaption: { fontSize: 11, marginTop: 14, color: '#52525b' },
  qrUrl: { fontSize: 9, marginTop: 6, color: '#0f766e' },

  bullet: { flexDirection: 'row', marginBottom: 5 },
  bulletDot: { width: 12, fontSize: 9.5, color: '#0f766e' },
  bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.5 },
  lead: { fontSize: 10, lineHeight: 1.55, color: '#3f3f46', marginBottom: 8 },
  subTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 5 },
  warnCard: { borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 4, padding: 9, marginTop: 6 },
  warnLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#b91c1c', marginBottom: 4 },
  // No flex here. bulletText sets flex:1, which is correct inside a row but makes stacked
  // siblings in a column share one line and render on top of each other.
  warnText: { fontSize: 9.5, lineHeight: 1.5, marginBottom: 2 },
  dayRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: '#f4f4f5' },
  emptyNote: { fontSize: 10, color: '#71717a', marginTop: 12 },

  footer: { position: 'absolute', bottom: 26, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#a1a1aa' },
});

export interface ClinicBranding {
  clinicName: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
}

// Accepts Prisma Decimal instances as well as plain numbers.
type Numeric = number | string | { toString(): string };

const num = (v: Numeric | null | undefined): number => (v == null ? 0 : Number(v.toString()));

export interface PlanDocumentInput {
  title: string;
  currency: string;
  doctorRecommendation?: string | null;
  diagnosisSnapshot?: string | null;
  aiSummary?: string | null;
  createdAt?: Date | string | null;
  patient: {
    firstName: string;
    lastName: string;
    gender?: string | null;
    email?: string | null;
    phone?: string | null;
    dateOfBirth?: Date | string | null;
    city?: string | null;
    country?: string | null;
    allergies?: string | null;
  };
  items: Array<{
    description: string;
    toothNumber?: string | null;
    toothCondition?: ToothCondition | null;
    material?: string | null;
    brand?: string | null;
    quantity: number;
    unitPrice?: Numeric | null;
    cost: Numeric;
    phaseNumber?: number | null;
    treatmentCategory?: { name: string } | null;
  }>;
  diagnoses?: Array<{ condition: ToothCondition; toothNumbers: string[]; notes?: string | null }>;
  stay?: {
    arrivalDate?: Date | string | null;
    arrivalFlight?: string | null;
    departureDate?: Date | string | null;
    departureFlight?: string | null;
    hotelName?: string | null;
    hotelAddress?: string | null;
    roomType?: string | null;
    nights?: number | null;
    companions?: number | null;
    checkInDate?: Date | string | null;
    checkOutDate?: Date | string | null;
    airportTransfer?: string | null;
    clinicTransfer?: string | null;
    notes?: string | null;
  } | null;
  scheduleItems?: Array<{
    date: Date | string;
    time?: string | null;
    title: string;
    location?: string | null;
    notes?: string | null;
  }>;
  phases?: Array<{
    phaseNumber: number;
    name?: string | null;
    discountAmount?: Numeric | null;
    discountPercent?: Numeric | null;
    healingPeriodMonths?: number | null;
  }>;
}

function fmtDate(d?: Date | string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10);
}

function money(n: number, currency: string): string {
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

/**
 * How a line item's teeth read in the pricing table. A full-arch span lists twelve numbers, which
 * wraps a narrow column into a mess — and the chart on the same page already shows precisely which
 * teeth they are, so past a handful the count is the more useful thing to print.
 */
function toothCell(toothNumber?: string | null): string {
  const teeth = parseToothNumbers(toothNumber);
  if (teeth.length === 0) return '—';
  if (teeth.length <= 4) return teeth.join(', ');
  return `${teeth.length} teeth`;
}

/** The mouth as charted today. */
function diagnosisConditions(plan: PlanDocumentInput): Record<string, ToothCondition> {
  const map: Record<string, ToothCondition> = {};
  for (const d of plan.diagnoses ?? []) for (const t of d.toothNumbers) map[t] = d.condition;
  return map;
}

/**
 * The mouth once the plan is done. Teeth already missing stay missing unless a procedure replaces
 * them, so the "after" picture never grows teeth the patient does not have. Each item's stored
 * condition is used when present and otherwise inferred, so plans predating that column still chart.
 */
function plannedConditions(plan: PlanDocumentInput): Record<string, ToothCondition> {
  const map: Record<string, ToothCondition> = {};
  for (const d of plan.diagnoses ?? []) {
    if (d.condition === 'MISSING') for (const t of d.toothNumbers) map[t] = 'MISSING';
  }
  for (const item of plan.items) {
    const condition = item.toothCondition ?? conditionFromText(item.treatmentCategory?.name, item.description);
    if (!condition) continue;
    for (const tooth of parseToothNumbers(item.toothNumber)) map[tooth] = condition;
  }
  return map;
}

const el = React.createElement;

function Footer(branding: ClinicBranding) {
  return el(
    View,
    { style: s.footer, fixed: true },
    el(Text, { style: s.footerText }, branding.clinicName),
    el(Text, {
      style: s.footerText,
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `${pageNumber} / ${totalPages}`,
    }),
  );
}

/** A small tooth mark for the cover, drawn from the same silhouette language as the chart. */
function CoverMark() {
  return el(
    Svg,
    { viewBox: '0 0 40 46', width: 34, height: 39 },
    el(Path, {
      d: 'M20 3 C11 3 5 9 5 17 c0 6 2 9 3 14 c1 5 1 11 3 12 c2 1 3 -3 4 -7 c1 -3 2 -6 5 -6 s4 3 5 6 c1 4 2 8 4 7 c2 -1 2 -7 3 -12 c1 -5 3 -8 3 -14 C35 9 29 3 20 3 Z',
      fill: '#ffffff',
      opacity: 0.9,
    }),
  );
}

function CoverPage(plan: PlanDocumentInput, branding: ClinicBranding) {
  const location = [branding.address, branding.city, branding.country].filter(Boolean).join(', ');
  return el(
    Page,
    { size: 'A4', style: s.coverPage, key: 'cover' },
    el(
      View,
      { style: s.coverBand },
      el(CoverMark, {}),
      el(Text, { style: s.coverClinic }, branding.clinicName.toUpperCase()),
      el(Text, { style: s.coverTitle }, 'Your Treatment Plan'),
      el(Text, { style: s.coverSubtitle }, plan.title),
    ),
    el(
      View,
      { style: s.coverBody },
      el(Text, { style: s.coverLabel }, 'PREPARED FOR'),
      el(Text, { style: s.coverValue }, `${plan.patient.firstName} ${plan.patient.lastName}`),
      el(Text, { style: s.coverLabel }, 'DATE'),
      el(Text, { style: s.coverValue }, fmtDate(plan.createdAt ?? new Date())),
      location ? el(Text, { style: s.coverLabel }, 'CLINIC') : null,
      location ? el(Text, { style: s.coverValue }, location) : null,
    ),
    el(
      Text,
      { style: s.coverFooter },
      'This document sets out proposed treatment and an estimate of its cost. It is not a substitute for a signed treatment consent form.',
    ),
  );
}

function Field(label: string, value: string, key: string) {
  return el(
    View,
    { style: s.field, key },
    el(Text, { style: s.fieldLabel }, label),
    el(Text, { style: s.fieldValue }, value || '—'),
  );
}

function PatientPage(plan: PlanDocumentInput, branding: ClinicBranding) {
  const p = plan.patient;
  const history = plan.diagnosisSnapshot?.trim();
  const allergies = p.allergies?.trim();
  return el(
    Page,
    { size: 'A4', style: s.page, key: 'patient' },
    el(Text, { style: s.h1 }, 'Patient Information'),
    el(Text, { style: s.h2 }, `${p.firstName} ${p.lastName}`),
    el(
      View,
      { style: s.fieldGrid },
      Field('Gender', p.gender && p.gender !== 'UNKNOWN' ? p.gender : '—', 'g'),
      Field('Email', p.email ?? '—', 'e'),
      Field('Phone', p.phone ?? '—', 'p'),
      Field('Date of Birth', fmtDate(p.dateOfBirth), 'd'),
      Field('Currency', plan.currency, 'c'),
      Field('Location', [p.city, p.country].filter(Boolean).join(', ') || '—', 'l'),
    ),
    // Only rendered when something was actually recorded. A printed "Allergies: —" reads as a
    // cleared allergy history rather than a question nobody asked, and that is not a claim this
    // document is in a position to make.
    history || allergies
      ? el(
          View,
          {},
          el(Text, { style: s.sectionTitle }, 'Medical Information'),
          allergies
            ? el(View, { style: s.card }, el(Text, { style: s.cardLabel }, 'ALLERGIES'), el(Text, {}, allergies))
            : null,
          history
            ? el(View, { style: s.card }, el(Text, { style: s.cardLabel }, 'DIAGNOSIS / HISTORY'), el(Text, {}, history))
            : null,
        )
      : null,
    plan.doctorRecommendation
      ? el(
          View,
          {},
          el(Text, { style: s.sectionTitle }, "Doctor's Recommendation"),
          el(View, { style: s.card }, el(Text, {}, plan.doctorRecommendation)),
        )
      : null,
    plan.aiSummary
      ? el(
          View,
          {},
          el(Text, { style: s.sectionTitle }, 'Summary'),
          el(View, { style: s.card }, el(Text, {}, plan.aiSummary)),
        )
      : null,
    Footer(branding),
  );
}

function DiagnosesPage(plan: PlanDocumentInput, branding: ClinicBranding) {
  const diagnoses = plan.diagnoses ?? [];
  return el(
    Page,
    { size: 'A4', style: s.page, key: 'diagnoses' },
    el(Text, { style: s.h1 }, 'Diagnoses'),
    el(Text, { style: s.h2 }, 'Current dental status'),
    el(View, { style: s.chartWrap }, el(DentalChartPdf, { conditions: diagnosisConditions(plan), mode: 'diagnosis', width: CONTENT_WIDTH })),
    el(
      View,
      { style: s.table },
      el(
        View,
        { style: s.thead },
        el(Text, { style: [s.th, { width: '45%' }] }, 'Diagnosis'),
        el(Text, { style: [s.th, { width: '55%' }] }, 'Teeth'),
      ),
      ...diagnoses.map((d, i) =>
        el(
          View,
          { style: s.tr, key: `d${i}`, wrap: false },
          el(
            Text,
            { style: [s.td, { width: '45%' }] },
            TOOTH_CONDITION_LABELS[d.condition] + (d.notes ? ` — ${d.notes}` : ''),
          ),
          el(Text, { style: [s.td, { width: '55%' }] }, [...d.toothNumbers].sort().join('  |  ')),
        ),
      ),
    ),
    Footer(branding),
  );
}

function TreatmentPage(plan: PlanDocumentInput, branding: ClinicBranding) {
  const totals = computePhaseTotals(
    plan.items.map((i) => ({ cost: num(i.cost), phaseNumber: i.phaseNumber })),
    (plan.phases ?? []).map((p) => ({
      phaseNumber: p.phaseNumber,
      name: p.name,
      discountAmount: p.discountAmount == null ? null : num(p.discountAmount),
      discountPercent: p.discountPercent == null ? null : num(p.discountPercent),
      healingPeriodMonths: p.healingPeriodMonths,
    })),
  );
  const grandTotal = totals.reduce((acc, t) => acc + t.total, 0);
  // A lone unnamed, undiscounted phase is just "the plan"; a heading for it is noise.
  const showPhases = totals.length > 1 || totals.some((t) => t.name || t.discount > 0 || t.healingPeriodMonths);

  const rows: React.ReactElement[] = [];
  for (const phase of totals) {
    if (showPhases) {
      rows.push(
        el(
          View,
          { style: s.trPhase, key: `ph${phase.phaseNumber}`, wrap: false },
          el(Text, { style: [s.td, s.bold, { width: '46%' }] }, phase.name || `Phase ${phase.phaseNumber}`),
          el(Text, { style: [s.td, { width: '12%' }] }, ''),
          el(Text, { style: [s.td, { width: '20%' }] }, ''),
          el(Text, { style: [s.td, s.bold, s.right, { width: '22%' }] }, money(phase.total, plan.currency)),
        ),
      );
    }
    for (const [i, item] of plan.items.filter((it) => (it.phaseNumber || 1) === phase.phaseNumber).entries()) {
      rows.push(
        el(
          View,
          { style: s.tr, key: `it${phase.phaseNumber}-${i}`, wrap: false },
          el(
            Text,
            { style: [s.td, { width: '46%' }] },
            item.description +
              (item.treatmentCategory && item.treatmentCategory.name !== item.description
                ? ` · ${item.treatmentCategory.name}`
                : '') +
              ([item.material, item.brand].filter(Boolean).length
                ? ` (${[item.material, item.brand].filter(Boolean).join(' / ')})`
                : ''),
          ),
          el(Text, { style: [s.td, s.center, { width: '12%' }] }, toothCell(item.toothNumber)),
          el(Text, { style: [s.td, s.center, { width: '20%' }] }, String(item.quantity)),
          el(Text, { style: [s.td, s.right, { width: '22%' }] }, money(num(item.cost), plan.currency)),
        ),
      );
    }
    if (phase.discount > 0) {
      rows.push(
        el(
          View,
          { style: s.tr, key: `dis${phase.phaseNumber}`, wrap: false },
          el(Text, { style: [s.td, s.bold, { width: '78%' }] }, 'Discount'),
          el(Text, { style: [s.td, s.right, { width: '22%' }] }, `- ${money(phase.discount, plan.currency)}`),
        ),
      );
    }
    if (phase.healingPeriodMonths) {
      rows.push(
        el(
          View,
          { style: s.tr, key: `heal${phase.phaseNumber}`, wrap: false },
          el(Text, { style: [s.td, s.bold, { width: '78%' }] }, 'Healing period'),
          el(Text, { style: [s.td, s.right, { width: '22%' }] }, `${phase.healingPeriodMonths} months`),
        ),
      );
    }
  }

  return el(
    Page,
    { size: 'A4', style: s.page, key: 'treatment' },
    el(Text, { style: s.h1 }, 'Treatment Plan'),
    el(Text, { style: s.h2 }, 'The proposed result'),
    plan.items.length === 0
      ? el(
          Text,
          { style: s.emptyNote },
          'No procedures have been added to this plan yet. Your dentist is still preparing it — this document will be reissued once the plan is complete.',
        )
      : null,
    plan.items.length === 0
      ? null
      : el(View, { style: s.chartWrap }, el(DentalChartPdf, { conditions: plannedConditions(plan), mode: 'plan', width: CONTENT_WIDTH })),
    plan.items.length === 0
      ? null
      : el(
      View,
      { style: s.table },
      el(
        View,
        { style: s.thead, fixed: true },
        el(Text, { style: [s.th, { width: '46%' }] }, 'Procedure'),
        el(Text, { style: [s.th, s.center, { width: '12%' }] }, 'Tooth'),
        el(Text, { style: [s.th, s.center, { width: '20%' }] }, 'Amount'),
        el(Text, { style: [s.th, s.right, { width: '22%' }] }, 'Price'),
      ),
      ...rows,
      el(
        View,
        { style: s.trTotal, wrap: false },
        el(Text, { style: [s.td, s.bold, { width: '78%' }] }, 'Total'),
        el(Text, { style: [s.td, s.bold, s.right, { width: '22%' }] }, money(grandTotal, plan.currency)),
      ),
    ),
    Footer(branding),
  );
}

function PortalPage(qrDataUrl: string, portalUrl: string, branding: ClinicBranding) {
  return el(
    Page,
    { size: 'A4', style: s.page, key: 'portal' },
    el(Text, { style: s.h1 }, 'View Online'),
    el(Text, { style: s.h2 }, 'Your plan, kept up to date'),
    el(
      View,
      { style: s.qrBlock },
      el(Image, { src: qrDataUrl, style: s.qr }),
      el(Text, { style: s.qrCaption }, 'Scan to open your treatment plan, ask a question, or approve it.'),
      el(Text, { style: s.qrUrl }, portalUrl),
    ),
    Footer(branding),
  );
}

function Bullets(lines: readonly string[], keyPrefix: string) {
  return lines.map((line, i) =>
    el(
      View,
      { style: s.bullet, key: `${keyPrefix}-${i}`, wrap: false },
      el(Text, { style: s.bulletDot }, '•'),
      el(Text, { style: s.bulletText }, line),
    ),
  );
}

/** Travel, hotel and transfers. Rows with nothing recorded are dropped rather than printed blank. */
function StayPage(plan: PlanDocumentInput, branding: ClinicBranding) {
  const stay = plan.stay!;
  const rows: [string, string][] = [];
  const add = (label: string, value?: string | number | null) => {
    if (value !== null && value !== undefined && String(value).trim() !== '') rows.push([label, String(value)]);
  };

  add('Arrival', [fmtDate(stay.arrivalDate), stay.arrivalFlight].filter((v) => v && v !== '—').join('  ·  '));
  add('Departure', [fmtDate(stay.departureDate), stay.departureFlight].filter((v) => v && v !== '—').join('  ·  '));
  add('Hotel', stay.hotelName);
  add('Hotel address', stay.hotelAddress);
  add('Room', stay.roomType);
  add('Nights', stay.nights);
  add('Travelling with', stay.companions ? `${stay.companions} companion(s)` : null);
  add('Check-in', stay.checkInDate ? fmtDate(stay.checkInDate) : null);
  add('Check-out', stay.checkOutDate ? fmtDate(stay.checkOutDate) : null);
  add('Airport transfer', stay.airportTransfer);
  add('Clinic transfer', stay.clinicTransfer);

  return el(
    Page,
    { size: 'A4', style: s.page, key: 'stay' },
    el(Text, { style: s.h1 }, 'Your Stay'),
    el(Text, { style: s.h2 }, 'Travel, accommodation and transfers'),
    el(
      View,
      { style: s.fieldGrid },
      ...rows.map(([label, value], i) => Field(label, value, `stay-${i}`)),
    ),
    stay.notes ? el(View, { style: s.card }, el(Text, { style: s.cardLabel }, 'NOTES'), el(Text, {}, stay.notes)) : null,
    el(Text, { style: s.subTitle }, 'Before you travel'),
    ...Bullets(TRAVEL_GUIDANCE.beforeYouTravel, 'bt'),
    el(Text, { style: s.subTitle }, 'During your stay'),
    ...Bullets(TRAVEL_GUIDANCE.duringYourStay, 'ds'),
    el(Text, { style: s.subTitle }, 'Before you fly home'),
    ...Bullets(TRAVEL_GUIDANCE.beforeYouFly, 'bf'),
    Footer(branding),
  );
}

/** Day-by-day itinerary, grouped so each date is announced once. */
function SchedulePage(plan: PlanDocumentInput, branding: ClinicBranding) {
  const items = [...(plan.scheduleItems ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const rows: React.ReactElement[] = [];
  let lastDate = '';
  for (const [i, item] of items.entries()) {
    const dateKey = fmtDate(item.date);
    if (dateKey !== lastDate) {
      rows.push(
        el(
          View,
          { style: s.trPhase, key: `d-${i}`, wrap: false },
          el(Text, { style: [s.td, s.bold] }, dateKey),
        ),
      );
      lastDate = dateKey;
    }
    rows.push(
      el(
        View,
        { style: s.dayRow, key: `i-${i}`, wrap: false },
        el(Text, { style: [s.td, { width: '18%' }] }, item.time ?? ''),
        el(
          Text,
          { style: [s.td, { width: '52%' }] },
          item.title + (item.notes ? ` — ${item.notes}` : ''),
        ),
        el(Text, { style: [s.td, { width: '30%' }] }, item.location ?? ''),
      ),
    );
  }

  return el(
    Page,
    { size: 'A4', style: s.page, key: 'schedule' },
    el(Text, { style: s.h1 }, 'Your Schedule'),
    el(Text, { style: s.h2 }, 'What happens on each day of your visit'),
    el(
      View,
      { style: s.table },
      el(
        View,
        { style: s.thead, fixed: true },
        el(Text, { style: [s.th, { width: '18%' }] }, 'Time'),
        el(Text, { style: [s.th, { width: '52%' }] }, 'Appointment'),
        el(Text, { style: [s.th, { width: '30%' }] }, 'Where'),
      ),
      ...rows,
    ),
    el(
      Text,
      { style: s.emptyNote },
      'Times may shift slightly on the day. Your coordinator will confirm each appointment with you in advance.',
    ),
    Footer(branding),
  );
}

/** Aftercare for the procedures in this plan, and nothing else. */
function AftercarePage(sections: typeof AFTERCARE_SECTIONS, branding: ClinicBranding) {
  return el(
    Page,
    { size: 'A4', style: s.page, key: 'aftercare' },
    el(Text, { style: s.h1 }, 'Your Treatment, Explained'),
    el(Text, { style: s.h2 }, 'What to expect, and how to look after yourself afterwards'),
    ...sections.flatMap((section, i) => [
      el(Text, { style: s.subTitle, key: `t-${i}` }, section.title),
      el(Text, { style: s.lead, key: `w-${i}` }, section.whatToExpect),
      ...Bullets(section.aftercare, `a-${i}`),
      section.warningSigns
        ? el(
            View,
            { style: s.warnCard, key: `s-${i}`, wrap: false },
            el(Text, { style: s.warnLabel }, 'CONTACT THE CLINIC IF YOU NOTICE'),
            ...section.warningSigns.map((w, j) =>
              el(Text, { style: s.warnText, key: `sw-${i}-${j}` }, `•  ${w}`),
            ),
          )
        : null,
    ]),
    Footer(branding),
  );
}

export function TreatmentPlanDocument(
  plan: PlanDocumentInput,
  branding: ClinicBranding,
  qrDataUrl?: string,
  portalUrl?: string,
) {
  const pages: React.ReactElement[] = [CoverPage(plan, branding), PatientPage(plan, branding)];
  if ((plan.diagnoses ?? []).length > 0) pages.push(DiagnosesPage(plan, branding));
  // Always print the treatment page, even with nothing on it. Silently dropping it produced a
  // document that looked broken rather than one that said the plan is still being drawn up.
  pages.push(TreatmentPage(plan, branding));

  const stay = plan.stay;
  const hasStay =
    !!stay && Object.values(stay).some((v) => v !== null && v !== undefined && String(v).trim() !== '');
  if (hasStay) pages.push(StayPage(plan, branding));
  if ((plan.scheduleItems ?? []).length > 0) pages.push(SchedulePage(plan, branding));

  // Aftercare covers only the procedures this patient is actually having, so a crown-only plan
  // does not hand someone a page about sinus surgery.
  const conditions = new Set<ToothCondition>();
  for (const item of plan.items) {
    const c = item.toothCondition ?? conditionFromText(item.treatmentCategory?.name, item.description);
    if (c) conditions.add(c);
  }
  const sections = aftercareFor(conditions);
  if (sections.length > 0) pages.push(AftercarePage(sections, branding));

  if (qrDataUrl && portalUrl) pages.push(PortalPage(qrDataUrl, portalUrl, branding));
  return el(Document, {}, ...pages);
}
