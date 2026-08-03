import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import {
  AFTERCARE_SECTIONS,
  TOOTH_CONDITION_LABELS,
  TRAVEL_GUIDANCE,
  aftercareFor,
  brandLine,
  computePaymentSummary,
  computePhaseTotals,
  conditionFromText,
  packageInclusionDef,
  parseToothNumbers,
  valuePropsFor,
  type ToothCondition,
} from '@dental-crm/shared';

import { DentalChartPdf } from './dental-chart-pdf';


/**
 * The document's design tokens.
 *
 * White page, one accent, and space. A quotation reads cheap when it is dense and boxed: every
 * panel outlined, every table headed with a filled bar, colour used as decoration rather than as
 * meaning. This document earns its weight typographically instead — hairline rules, a fixed type
 * scale, and margins wide enough to be obviously deliberate.
 *
 * `accent` is the clinic's own blue, sampled from its brand banner rather than chosen. It is used
 * sparingly and on purpose: totals, and the single filled block on the payment page. A colour that
 * appears everywhere emphasises nothing.
 */
const T = {
  accent: '#183858',
  accentDeep: '#102841',
  /** For text on the accent fill — light enough to read, quiet enough not to compete. */
  accentOn: '#A9C4DC',
  accentTint: '#F4F7FA',
  ink: '#16191D',
  body: '#3A414A',
  /** Measured at 4.6:1 on white — the quiet grey that still clears AA. */
  muted: '#5C6570',
  faint: '#8A929C',
  hairline: '#E2E6EB',
  hairlineSoft: '#F0F3F6',
  white: '#FFFFFF',
  // Warnings keep their own hues. A payment surcharge and a clinical red flag must not read as
  // brand furniture, so these stay boxed while everything else loses its outline.
  warnBg: '#FFF8F1',
  warnEdge: '#F0D6B8',
  warnInk: '#8A4A16',
  alertBg: '#FEF3F2',
  alertEdge: '#F3CBC7',
  alertInk: '#A62B22',
} as const;

// A4 at 72dpi is 595x842pt; 56pt margins leave 483pt of usable width.
const CONTENT_WIDTH = 483;

const s = StyleSheet.create({
  page: { paddingHorizontal: 56, paddingTop: 56, paddingBottom: 64, fontSize: 10, fontFamily: 'Helvetica', color: T.ink },
  coverPage: { padding: 0, fontSize: 10, fontFamily: 'Helvetica', color: T.ink },

  // Full bleed: no page padding on the cover, so the photograph runs edge to edge the way it would
  // in a brochure rather than sitting in a frame of white.
  coverPhoto: { width: '100%', height: 250, objectFit: 'cover' },
  // The title block sits on white beneath the photograph. It used to sit on a filled band, which
  // made the cover read as a form header rather than the front of something considered.
  coverBody: { paddingHorizontal: 56, paddingTop: 44 },
  coverClinic: { fontSize: 9, color: T.muted, letterSpacing: 1.6, fontFamily: 'Helvetica-Bold' },
  coverTitle: { fontSize: 34, color: T.ink, marginTop: 16, fontFamily: 'Helvetica-Bold', letterSpacing: -0.9 },
  coverSubtitle: { fontSize: 12, color: T.muted, marginTop: 10 },
  coverLabel: { fontSize: 8, color: T.faint, letterSpacing: 1.1, marginBottom: 4 },
  coverValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 18 },
  // Date and clinic sit side by side rather than stacked, which is what left the page bottom-heavy
  // with nothing under it.
  coverMetaRow: { flexDirection: 'row', marginTop: 30 },
  coverMetaCol: { width: '34%' },
  coverMetaColWide: { flex: 1 },
  coverMetaValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  // The headline figures, filling the band that used to be empty.
  coverStats: {
    flexDirection: 'row',
    marginTop: 34,
    marginHorizontal: 56,
    borderTopWidth: 1,
    borderTopColor: T.hairline,
    paddingTop: 22,
  },
  coverStat: { flex: 1 },
  coverStatLabel: { fontSize: 7.5, color: T.faint, letterSpacing: 1.1, marginBottom: 6 },
  coverStatValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: T.accent, letterSpacing: -0.3 },
  coverFooter: { position: 'absolute', bottom: 46, left: 56, right: 56, fontSize: 8, color: T.faint, lineHeight: 1.5 },

  // One stepped type scale, so nine pages of headings stay in a relationship with each other.
  h1: { fontSize: 26, fontFamily: 'Helvetica-Bold', letterSpacing: -0.7, color: T.ink },
  h2: { fontSize: 11, color: T.muted, marginTop: 8, marginBottom: 30 },
  sectionTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 24, marginBottom: 10 },

  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  field: { width: '50%', marginBottom: 18 },
  fieldLabel: { fontSize: 8, color: T.faint, letterSpacing: 1, marginBottom: 4 },
  fieldValue: { fontSize: 11.5 },

  // A rule above rather than a box around. An outlined panel says "form"; a rule says "section".
  card: { borderTopWidth: 1, borderTopColor: T.hairline, paddingTop: 10, marginBottom: 16 },
  cardLabel: { fontSize: 8, color: T.faint, letterSpacing: 1, fontFamily: 'Helvetica-Bold', marginBottom: 6 },

  // Typographic table: a rule under the head and between rows, no outline, no filled header bar.
  table: { marginTop: 18 },
  thead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.ink, paddingBottom: 7 },
  th: { color: T.muted, fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
  tr: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.hairlineSoft },
  trPhase: { flexDirection: 'row', paddingTop: 16, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: T.hairline },
  trTotal: { flexDirection: 'row', paddingTop: 12, borderTopWidth: 1, borderTopColor: T.ink, marginTop: 2 },
  td: { fontSize: 9.5 },
  bold: { fontFamily: 'Helvetica-Bold' },
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },

  chartWrap: { marginTop: 14, marginBottom: 10 },
  qrBlock: { alignItems: 'center', marginTop: 44 },
  qr: { width: 180, height: 180 },
  qrCaption: { fontSize: 10.5, marginTop: 16, color: T.muted },
  qrUrl: { fontSize: 9, marginTop: 6, color: T.accent },

  bullet: { flexDirection: 'row', marginBottom: 7 },
  bulletDot: { width: 13, fontSize: 9.5, color: T.accent },
  bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.6 },
  lead: { fontSize: 10, lineHeight: 1.7, color: T.body, marginBottom: 12 },
  subTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 22, marginBottom: 8, color: T.ink },
  // Wraps one complete section — heading, paragraph, bullets, warning card — so react-pdf moves
  // the whole thing to the next page rather than splitting it and leaving a gap behind.
  valueBlock: { marginBottom: 10 },
  // "What's included" checklist.
  includeRow: { flexDirection: 'row', marginBottom: 14 },
  includeTick: { width: 19, fontSize: 11, color: T.accent, fontFamily: 'Helvetica-Bold' },
  includeBody: { flex: 1 },
  includeLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  includeDetail: { fontSize: 9.5, color: T.muted, lineHeight: 1.5 },
  assuranceCard: { marginTop: 18, backgroundColor: T.accentTint, padding: 16 },
  assuranceText: { fontSize: 10, color: T.accentDeep, lineHeight: 1.6 },

  // The payment hero is the one filled block in the document. Reserving colour for a single moment
  // is what lets that moment carry weight.
  payHero: { backgroundColor: T.accent, padding: 26, marginBottom: 22 },
  payHeroLabel: { fontSize: 7.5, color: T.accentOn, letterSpacing: 1.4, marginBottom: 8 },
  payHeroValue: { fontSize: 34, color: T.white, fontFamily: 'Helvetica-Bold', letterSpacing: -0.8 },
  payHeroNote: { fontSize: 9, color: T.accentOn, marginTop: 9 },
  payBlock: { marginBottom: 18 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.hairlineSoft },
  payLabel: { fontSize: 10, color: T.body },
  payValue: { fontSize: 10, textAlign: 'right' },
  payCard: { borderWidth: 1, borderColor: T.warnEdge, backgroundColor: T.warnBg, padding: 14, marginBottom: 14 },
  payCardTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: T.warnInk, marginBottom: 6 },
  payCardText: { fontSize: 9.5, color: T.warnInk, lineHeight: 1.6 },
  warnCard: { borderWidth: 1, borderColor: T.alertEdge, backgroundColor: T.alertBg, padding: 11, marginTop: 8 },
  warnLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: T.alertInk, letterSpacing: 0.8, marginBottom: 5 },
  // No flex here. bulletText sets flex:1, which is correct inside a row but makes stacked
  // siblings in a column share one line and render on top of each other.
  warnText: { fontSize: 9.5, lineHeight: 1.6, marginBottom: 3 },
  dayRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.hairlineSoft },
  emptyNote: { fontSize: 9.5, color: T.muted, marginTop: 16, lineHeight: 1.6 },

  footer: { position: 'absolute', bottom: 32, left: 56, right: 56, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: T.faint },
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
  /** Keys from PACKAGE_INCLUSIONS. What the quoted price covers. */
  packageIncludes?: string[];
  depositAmount?: Numeric | null;
  cardFeePercent?: Numeric | null;
  cashDiscountPercent?: Numeric | null;
  flightRefundNote?: string | null;
  paymentTerms?: string | null;
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

/**
 * The four things a patient wants to know before reading anything else: what it costs, how many
 * trips it takes, how long it runs, and how many teeth are involved.
 *
 * Computed here rather than on the treatment page so the cover and the pricing table can never
 * disagree about the total — one function, one answer.
 */
function planHeadlines(plan: PlanDocumentInput) {
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
  const total = totals.reduce((acc, t) => acc + t.total, 0);

  // Distinct teeth, not line items: four implants on four teeth is "4 teeth", and a plan touching
  // one tooth three times is still one tooth.
  const teeth = new Set<string>();
  for (const item of plan.items) for (const t of parseToothNumbers(item.toothNumber)) teeth.add(t);

  // Healing between phases is what makes this a second trip rather than a longer first one.
  const healing = totals.reduce((acc, t) => acc + (t.healingPeriodMonths ?? 0), 0);

  return { total, visits: totals.length, teeth: teeth.size, healingMonths: healing };
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

// The cover's tooth mark is gone. It existed to give a filled band something to hold; with a
// photograph of the clinic at the head of the page and the name set in type beneath it, a drawn
// icon was a third thing saying what the first two already said.

/**
 * The clinic's own reception, full bleed across the head of the cover.
 *
 * Typography alone said nothing about whether this was a real building. A patient in Lyon deciding
 * whether to board a plane is answering "is this place what it claims to be?", and a photograph
 * answers it in a way no sentence on the page can.
 *
 * Resolved from __dirname so it works both from src under ts-node and from dist in production;
 * nest-cli copies pdf/assets into the build, since tsc alone drops everything that is not a .ts.
 * Missing file means no banner rather than a failed render — a dossier that will not generate is
 * far worse than one without a photograph on it.
 */
const COVER_PHOTO = path.join(__dirname, 'assets', 'clinic-cover.jpg');

/**
 * Read once, as bytes.
 *
 * A string `src` is treated as a URL and fetched, so handing react-pdf a filesystem path produced
 * "fetch failed", a cover with no photograph on it, and a PDF that rendered perfectly well while
 * quietly dropping the image. Passing the buffer removes the network from the path entirely.
 */
const coverPhoto: { data: Buffer; format: 'jpg' } | null = (() => {
  try {
    return { data: fs.readFileSync(COVER_PHOTO), format: 'jpg' as const };
  } catch {
    return null;
  }
})();

/**
 * The headline figures, in a strip across the foot of the cover.
 *
 * Somebody opening this wants four answers before they read anything: what it costs, how many
 * trips, how long, how much work. They were previously scattered across pages four and six, under
 * a quarter of a page of white space.
 */
function CoverHeadlines(plan: PlanDocumentInput) {
  if (plan.items.length === 0) return null;
  const { total, visits, teeth, healingMonths } = planHeadlines(plan);

  const cells: Array<[string, string]> = [['TOTAL', money(total, plan.currency)]];
  if (teeth > 0) cells.push(['TEETH TREATED', String(teeth)]);
  if (visits > 1) cells.push(['VISITS', String(visits)]);
  // Only stated when there is healing between phases — otherwise it is one trip and saying
  // "0 months" invites the question it was meant to answer.
  if (healingMonths > 0) cells.push(['OVER', `${healingMonths} months`]);

  return el(
    View,
    { style: s.coverStats },
    ...cells.map(([label, value], i) =>
      el(
        View,
        { key: `st-${i}`, style: s.coverStat },
        el(Text, { style: s.coverStatLabel }, label),
        el(Text, { style: s.coverStatValue }, value),
      ),
    ),
  );
}

function CoverPage(plan: PlanDocumentInput, branding: ClinicBranding) {
  const location = [branding.address, branding.city, branding.country].filter(Boolean).join(', ');
  return el(
    Page,
    { size: 'A4', style: s.coverPage, key: 'cover' },
    coverPhoto ? el(Image, { src: coverPhoto, style: s.coverPhoto }) : null,
    // The title sits on white under the photograph rather than on a filled band. The band made the
    // cover read as a form header; a photograph and then quiet type reads as the front of something
    // somebody meant.
    el(
      View,
      { style: s.coverBody },
      el(Text, { style: s.coverClinic }, branding.clinicName.toUpperCase()),
      el(Text, { style: s.coverTitle }, 'Your Treatment Plan'),
      el(Text, { style: s.coverSubtitle }, plan.title),
      el(Text, { style: [s.coverLabel, { marginTop: 38 }] }, 'PREPARED FOR'),
      el(Text, { style: s.coverValue }, `${plan.patient.firstName} ${plan.patient.lastName}`),
      el(
        View,
        { style: s.coverMetaRow },
        el(
          View,
          { style: s.coverMetaCol },
          el(Text, { style: s.coverLabel }, 'DATE'),
          el(Text, { style: s.coverMetaValue }, fmtDate(plan.createdAt ?? new Date())),
        ),
        location
          ? el(
              View,
              { style: s.coverMetaColWide },
              el(Text, { style: s.coverLabel }, 'CLINIC'),
              el(Text, { style: s.coverMetaValue }, location),
            )
          : null,
      ),
    ),
    // The four questions a patient asks before reading a word of the detail. A quarter of this page
    // used to be blank underneath the address; it now answers them.
    CoverHeadlines(plan),
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

/**
 * The portal QR, folded into the foot of the last page rather than given one of its own.
 *
 * It used to be an entire A4 sheet carrying a single code and two lines of caption — the emptiest
 * page in the dossier, and the last thing the patient was left looking at.
 */
function PortalBlock(qrDataUrl: string, portalUrl: string) {
  return el(
    View,
    { style: s.qrBlock, wrap: false, key: 'portal-block' },
    el(Image, { src: qrDataUrl, style: s.qr }),
    el(Text, { style: s.qrCaption }, 'Scan to open your treatment plan, ask a question, or approve it.'),
    el(Text, { style: s.qrUrl }, portalUrl),
  );
}

/**
 * What the patient is buying, and why it is worth the trip.
 *
 * The price table said "Zirconia crown · 220 EUR" and left somebody comparing three clinics to
 * decide for themselves whether that was good. This answers it, keyed on the procedures actually
 * in the plan — a patient having four implants does not read about veneers.
 *
 * Sits immediately after the pricing, which is where "why this and not the cheaper quote?" gets
 * asked.
 */
function ValuePage(plan: PlanDocumentInput, branding: ClinicBranding) {
  const conditions = plan.items
    .map((i) => i.toothCondition ?? conditionFromText(i.treatmentCategory?.name, i.description))
    .filter((c): c is ToothCondition => !!c);
  const props = valuePropsFor(conditions);
  if (props.length === 0) return null;

  // Brand is per procedure, so it comes from the first item matching this proposition that has one
  // recorded at all — today, usually none, which is why the copy reads finished without it.
  const extraFor = (condition: ToothCondition): string | undefined => {
    for (const item of plan.items) {
      const c = item.toothCondition ?? conditionFromText(item.treatmentCategory?.name, item.description);
      if (c !== condition) continue;
      const line = brandLine(item.material, item.brand);
      if (line) return line;
    }
    return undefined;
  };

  return el(
    Page,
    { size: 'A4', style: s.page, key: 'value' },
    el(Text, { style: s.h1 }, 'What Your Treatment Includes'),
    el(Text, { style: s.h2 }, 'Why each part of this plan is what we recommend'),
    ...props.map((prop, i) => {
      const extra = extraFor(prop.condition);
      // wrap:false keeps a heading from being orphaned at the foot of a page with its own text
      // stranded overleaf, which is exactly what made the dossier read as gappy.
      return el(
        View,
        { key: `vp-${i}`, wrap: false, style: s.valueBlock },
        el(Text, { style: s.subTitle }, prop.title),
        el(Text, { style: s.lead }, extra ? `${prop.pitch} ${extra}` : prop.pitch),
        ...Bullets(prop.points, `vpb-${i}`),
      );
    }),
    Footer(branding),
  );
}

/**
 * What the price includes, as a checklist.
 *
 * The single strongest paragraph on the clinic's old quotation was "the package includes hotel,
 * medication, X-rays and all necessary aftercare — there are no hidden or additional fees". A
 * patient comparing quotes is trying to work out what the other clinic has left out of theirs, and
 * this is the page that answers it.
 */
function PackagePage(plan: PlanDocumentInput, branding: ClinicBranding) {
  const included = (plan.packageIncludes ?? [])
    .map((key) => packageInclusionDef(key))
    .filter((d): d is NonNullable<typeof d> => !!d);
  if (included.length === 0) return null;

  return el(
    Page,
    { size: 'A4', style: s.page, key: 'package' },
    el(Text, { style: s.h1 }, "What's Included"),
    el(Text, { style: s.h2 }, 'Covered by the price quoted — not billed separately'),
    ...included.map((item, i) =>
      el(
        View,
        { key: `inc-${i}`, style: s.includeRow, wrap: false },
        el(Text, { style: s.includeTick }, '✓'),
        el(
          View,
          { style: s.includeBody },
          el(Text, { style: s.includeLabel }, item.label),
          el(Text, { style: s.includeDetail }, item.detail),
        ),
      ),
    ),
    el(
      View,
      { style: s.assuranceCard, wrap: false },
      el(Text, { style: s.assuranceText }, 'There are no hidden or additional fees. Everything listed above is covered by the total on the previous page.'),
    ),
    Footer(branding),
  );
}

/**
 * What it costs by payment method, and what is due when.
 *
 * The clinic charges the processor's international-card fee through to the patient and discounts
 * for cash, which is a real difference of hundreds on a full-mouth case. It was previously a
 * paragraph a coordinator retyped into every proposal, which is how two patients end up holding
 * two different sets of terms.
 */
function PaymentPage(plan: PlanDocumentInput, branding: ClinicBranding) {
  const { total } = planHeadlines(plan);
  const hasTerms =
    plan.depositAmount != null ||
    plan.cardFeePercent != null ||
    plan.cashDiscountPercent != null ||
    !!plan.paymentTerms ||
    !!plan.flightRefundNote;
  if (total <= 0 || !hasTerms) return null;

  const sum = computePaymentSummary({
    total,
    depositAmount: plan.depositAmount == null ? null : num(plan.depositAmount),
    cardFeePercent: plan.cardFeePercent == null ? null : num(plan.cardFeePercent),
    cashDiscountPercent: plan.cashDiscountPercent == null ? null : num(plan.cashDiscountPercent),
  });

  const line = (label: string, value: string, strong = false) =>
    el(
      View,
      { style: s.payRow, key: label },
      el(Text, { style: strong ? [s.payLabel, s.bold] : s.payLabel }, label),
      el(Text, { style: strong ? [s.payValue, s.bold] : s.payValue }, value),
    );

  return el(
    Page,
    { size: 'A4', style: s.page, key: 'payment' },
    el(Text, { style: s.h1 }, 'Payment'),
    el(Text, { style: s.h2 }, 'What is due, and what each method costs'),

    el(
      View,
      { style: s.payHero, wrap: false },
      el(Text, { style: s.payHeroLabel }, 'TOTAL, PAID IN CASH'),
      el(Text, { style: s.payHeroValue }, money(sum.cashTotal, plan.currency)),
      sum.cashDiscountPercent > 0
        ? el(Text, { style: s.payHeroNote }, `Includes a ${sum.cashDiscountPercent}% cash discount on ${money(sum.total, plan.currency)}.`)
        : null,
    ),

    el(
      View,
      { style: s.payBlock },
      line('Treatment total', money(sum.total, plan.currency)),
      sum.cashDiscountPercent > 0 ? line(`Cash discount (${sum.cashDiscountPercent}%)`, `- ${money(sum.total - sum.cashTotal, plan.currency)}`) : null,
      line('Payable in cash', money(sum.cashTotal, plan.currency), true),
      sum.deposit > 0 ? line('Deposit to reserve your dates', money(sum.deposit, plan.currency)) : null,
      sum.deposit > 0 ? line('Remaining on arrival', money(sum.remaining, plan.currency), true) : null,
    ),

    // Stated as the difference rather than only as a percentage: "16%" is abstract, "+560 EUR" is
    // the number that decides how somebody pays.
    sum.cardFeePercent > 0
      ? el(
          View,
          { style: s.payCard, wrap: false },
          el(Text, { style: s.payCardTitle }, `Paying by international card adds ${sum.cardFeePercent}%`),
          el(
            Text,
            { style: s.payCardText },
            `Card payment comes to ${money(sum.cardTotal, plan.currency)} — ${money(sum.cardExtra, plan.currency)} more than paying in cash. This surcharge is charged by the payment processor on international transactions and is passed on without any addition by the clinic.`,
          ),
        )
      : null,

    plan.flightRefundNote
      ? el(View, { style: s.card, wrap: false }, el(Text, { style: s.cardLabel }, 'YOUR FLIGHT'), el(Text, {}, plan.flightRefundNote))
      : null,
    plan.paymentTerms
      ? el(View, { style: s.card, wrap: false }, el(Text, { style: s.cardLabel }, 'TERMS'), el(Text, {}, plan.paymentTerms))
      : null,

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
  // Tolerates a plan with appointments but no travel booked yet, which is the ordinary state of a
  // plan between the patient agreeing to it and the coordinator booking flights.
  const stay = plan.stay ?? {};
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
    el(Text, { style: s.h1 }, 'Your Visit'),
    el(Text, { style: s.h2 }, 'Travel, accommodation, transfers and what happens each day'),
    el(
      View,
      { style: s.fieldGrid },
      ...rows.map(([label, value], i) => Field(label, value, `stay-${i}`)),
    ),
    stay.notes ? el(View, { style: s.card }, el(Text, { style: s.cardLabel }, 'NOTES'), el(Text, {}, stay.notes)) : null,
    ScheduleBlock(plan),
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
/**
 * The day-by-day schedule, as a block rather than a page.
 *
 * On its own it was the emptiest sheet in the dossier — one appointment and 622pt of white below
 * it. It belongs with the travel and hotel details anyway: they are one trip, and a patient
 * planning that trip should not have to turn a page between where they are staying and when they
 * are expected.
 */
function ScheduleBlock(plan: PlanDocumentInput) {
  const items = [...(plan.scheduleItems ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  if (items.length === 0) return null;

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
    View,
    { key: 'schedule-block' },
    el(Text, { style: s.subTitle }, 'Day by day'),
    el(
      View,
      { style: s.table },
      el(
        View,
        { style: s.thead },
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
  );
}

/**
 * Aftercare for the procedures in this plan, and nothing else.
 *
 * Each procedure's heading, description, instructions and warning card are wrapped in one
 * unbreakable block. Previously they were loose siblings, so a page could end on a heading with
 * its instructions overleaf, leaving a half-empty sheet and a section split down the middle.
 */
function AftercarePage(
  sections: typeof AFTERCARE_SECTIONS,
  branding: ClinicBranding,
  trailing?: React.ReactElement | null,
) {
  return el(
    Page,
    { size: 'A4', style: s.page, key: 'aftercare' },
    el(Text, { style: s.h1 }, 'Your Treatment, Explained'),
    el(Text, { style: s.h2 }, 'What to expect, and how to look after yourself afterwards'),
    ...sections.map((section, i) =>
      el(
        View,
        // Not wrap:false — an aftercare section can run half a page, and forcing the whole thing
        // to jump leaves exactly the gap this is meant to avoid. minPresenceAhead lets it split,
        // but only where at least this much of it follows the break, so a heading is never left
        // stranded at the foot of a page with its instructions overleaf.
        { key: `sec-${i}`, minPresenceAhead: 90, style: s.valueBlock },
        el(Text, { style: s.subTitle }, section.title),
        el(Text, { style: s.lead }, section.whatToExpect),
        ...Bullets(section.aftercare, `a-${i}`),
        section.warningSigns
          ? el(
              View,
              { style: s.warnCard, wrap: false },
              el(Text, { style: s.warnLabel }, 'CONTACT THE CLINIC IF YOU NOTICE'),
              ...section.warningSigns.map((w, j) =>
                el(Text, { style: s.warnText, key: `sw-${i}-${j}` }, `•  ${w}`),
              ),
            )
          : null,
      ),
    ),
    trailing ?? null,
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

  // Directly after the price, where the patient is deciding whether it is worth it.
  const valuePage = ValuePage(plan, branding);
  if (valuePage) pages.push(valuePage);

  // What the price covers, then what it costs to pay it. Both immediately after the figure they
  // qualify, because that is the order the questions arrive in.
  const packagePage = PackagePage(plan, branding);
  if (packagePage) pages.push(packagePage);
  const paymentPage = PaymentPage(plan, branding);
  if (paymentPage) pages.push(paymentPage);

  const stay = plan.stay;
  const hasStay =
    !!stay && Object.values(stay).some((v) => v !== null && v !== undefined && String(v).trim() !== '');
  // One page for the whole trip. The schedule used to have a sheet of its own and reliably carried
  // a single appointment on it, which is how the dossier ended up with a near-blank page in the
  // middle. Either half is enough to warrant the page; both share it.
  if (hasStay || (plan.scheduleItems ?? []).length > 0) pages.push(StayPage(plan, branding));

  // Aftercare covers only the procedures this patient is actually having, so a crown-only plan
  // does not hand someone a page about sinus surgery.
  const conditions = new Set<ToothCondition>();
  for (const item of plan.items) {
    const c = item.toothCondition ?? conditionFromText(item.treatmentCategory?.name, item.description);
    if (c) conditions.add(c);
  }
  const sections = aftercareFor(conditions);
  const portal = qrDataUrl && portalUrl ? PortalBlock(qrDataUrl, portalUrl) : null;

  if (sections.length > 0) {
    // The QR rides at the foot of the last page instead of claiming an A4 sheet to itself.
    pages.push(AftercarePage(sections, branding, portal));
  } else if (portal) {
    // No aftercare to print — a crown-only plan, say — so the code needs a home of its own. Given
    // a heading and a sentence rather than left floating on an otherwise blank sheet.
    pages.push(
      el(
        Page,
        { size: 'A4', style: s.page, key: 'portal' },
        el(Text, { style: s.h1 }, 'Your Plan Online'),
        el(Text, { style: s.h2 }, 'Kept up to date, and open to your questions'),
        el(
          Text,
          { style: s.lead },
          'This document is a snapshot of today. The link below always shows the current version of your plan, lets you ask your coordinator a question against any line of it, and is where you approve the plan when you are ready to go ahead.',
        ),
        portal,
        Footer(branding),
      ),
    );
  }

  return el(Document, {}, ...pages);
}
