import React from 'react';
import { documentLabels, documentDate, invoiceStatusLabel, invoiceDisplayTotals } from './document-presentation';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Font,
  Svg,
  G,
  Path,
  Circle,
  Rect,
  Line,
  Text as SvgText,
  renderToBuffer,
} from '@react-pdf/renderer';
import * as fs from 'fs';
import * as path from 'path';
import {
  unassignedConsultationUnits,
  consultationChart,
  consultationToothGeometry,
  consultationToothLayers,
  consultationBridgeConnectors,
  procedureDescription,
  consultationCopy,
  consultationItinerary,
  consultationTotals,
  consultationQuotedPayment,
  consultationPresentationCopy,
  consultationVisitBreakdown,
  consultationVisitPurpose,
  consultationTreatmentSummary,
  consultationBrandPalette,
  procedureSteps,
  UPPER_TEETH,
  LOWER_TEETH,
  type Consultation,
  type DocumentConfiguration,
  type DrawOp,
  type ConsultationChartMode,
  type ConsultationTooth,
} from '@dental-crm/shared';
const el = React.createElement;
const asset = (name: string) =>
  [
    path.join(__dirname, '../pdf/assets', name),
    path.join(process.cwd(), 'src/pdf/assets', name),
    path.join(process.cwd(), 'apps/api/src/pdf/assets', name),
  ].find((p) => fs.existsSync(p));
for (const family of ['NotoSans', 'DejaVuSans']) {
  const regular = asset('fonts/' + family + '-Regular.ttf'),
    bold = asset('fonts/' + family + '-Bold.ttf');
  if (regular && bold)
    Font.register({
      family,
      fonts: [
        { src: regular, fontWeight: 400 },
        { src: bold, fontWeight: 700 },
      ],
    });
}

export interface DocumentContext {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    diagnosis?: string | null;
    allergies?: string | null;
    medications?: string | null;
    medicalConditions?: string | null;
    previousSurgeries?: string | null;
    takesBloodThinners?: boolean | null;
    isPregnant?: boolean | null;
    isSmoker?: boolean | null;
    dateOfBirth?: Date | string | null;
    nationality?: string | null;
  };
  clinic: {
    clinicName: string;
    logoUrl?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
  };
  config: DocumentConfiguration;
  plan: Consultation;
  payment?: {
    terms?: string | null;
    cardFee?: number | null;
    cashDiscount?: number | null;
    depositPercent?: number | null;
    depositAmount?: number | null;
  };
  generatedAt: string;
  documentId?: string;
  version?: number;
  verificationQr?: string;
  kind?: 'PLAN' | 'INVOICE' | 'WARRANTY';
  invoice?: {
    invoiceNumber: string;
    currency?: string;
    issuedAt?: Date | string | null;
    dueDate?: Date | string | null;
    createdAt?: Date | string | null;
    status: string;
    items: {
      description: string;
      quantity: number;
      unitPrice: number | string;
      total: number | string;
    }[];
    subtotal: number | string;
    discount: number | string;
    tax: number | string;
    total: number | string;
    payments: { amount: number | string; status: string; currency?: string; paidAt?: Date | string | null; method?: string; reference?: string | null }[];
  };
  warranty?: {
    certificateNumber: string;
    startDate: string;
    completedAt?: string;
    durationMonths: number;
    lifetime?: boolean;
    termsAndConditions: string;
    maintenanceRequirements?: string | null;
    exclusions?: string | null;
    description: string;
    positions?: string | null;
    material?: string | null;
    brand?: string | null;
    dentist?: string;
  };
}
function ops(list: DrawOp[]) {
  return list.map((o, i) => {
    switch (o.kind) {
      case 'path':
        return el(Path, { ...o, key: i });
      case 'circle':
        return el(Circle, { ...o, key: i });
      case 'rect':
        return el(Rect, { ...o, key: i });
      case 'line':
        return el(Line, { ...o, key: i });
    }
  });
}
export function ConsultationChartPdf(plan: Consultation, visit: number, mode: ConsultationChartMode = 'proposed', height = 180) {
  const state = consultationChart(plan, visit, mode);
  return el(
    Svg,
    { viewBox: '0 0 640 265', width: 510, height },
    el(Rect, { x: 0, y: 0, width: 640, height: 66, rx: 15, fill: '#f4e3c3' }),
    el(Rect, { x: 0, y: 190, width: 640, height: 65, rx: 15, fill: '#f4e3c3' }),
    ...[UPPER_TEETH, LOWER_TEETH].flatMap((arch, a) =>
      arch.map((fdi, i) => {
        const layer = consultationToothLayers(plan, visit, fdi, mode);
        const x = 20 + i * 39 + (i >= 8 ? 8 : 0),
          y = a === 0 ? 66 : 190;
        return el(
          G,
          { key: fdi },
          el(
            G,
            {
              transform: `translate(${x},${y}) scale(0.7,${a === 0 ? -0.7 : 0.7})`,
              opacity: state[fdi] ? 1 : 0.4,
            },
            ...ops(layer.subgingival),
            ...ops(layer.supragingival),
          ),
          el(
            SvgText,
            {
              x: x - 8,
              y: a === 0 ? 115 : 145,
              style: { fontSize: 13, fontFamily: 'NotoSans' },
              fill: '#253d51',
            },
            fdi,
          ),
        );
      }),
    ),
    ...consultationBridgeConnectors(plan, visit, mode).map((segment, key) =>
      el(Line, {
        ...segment,
        y1: segment.y,
        y2: segment.y,
        key: 'bridge-' + key,
        stroke: '#9eb8bf',
        strokeWidth: 4,
      }),
    ),
    el(Line, { x1: 8, y1: 66, x2: 632, y2: 66, stroke: '#d5a1a4', strokeWidth: 4 }),
    el(Line, { x1: 8, y1: 190, x2: 632, y2: 190, stroke: '#d5a1a4', strokeWidth: 4 }),
  );
}
export function consultationDocument(context: DocumentContext) {
  const { plan, config, clinic, patient } = context,
    t = consultationCopy(plan.language),
    rtl = plan.language === 'ar';
  const d = documentLabels(plan.language);
  const totals = consultationTotals(plan);
  const p = consultationPresentationCopy(plan.language);
  const quotedPayment = consultationQuotedPayment(plan, context.payment);
  const { accent, onAccent, heading: headingColour } = consultationBrandPalette(config.accentColor);
  const logo = config.logo || clinic.logoUrl;
  const font = rtl ? 'DejaVuSans' : 'NotoSans';
  const money = (v: number) =>
    `${plan.currency} ${v.toLocaleString(plan.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = (s: string, size = 11, colour?: string) =>
    el(
      Text,
      {
        style: {
          ...(colour ? { color: colour } : {}),
          fontSize: size === 11 ? context.invoice ? 9 : 9.5 : size,
          lineHeight: context.invoice ? 1.25 : 1.35,
          marginBottom: context.invoice ? 3 : 4,
          textAlign: rtl ? 'right' : 'left',
          fontFamily: /[\u0600-\u06ff]/.test(s) ? 'DejaVuSans' : font,
        },
      },
      s,
    );
  const heading = (s: string) =>
    el(
      Text,
      {
        style: {
          fontSize: context.invoice ? 16 : 18,
          // DejaVu's bold Arabic ligatures can lose character clusters in textkit; use the
          // regular Arabic face and size/color to preserve heading hierarchy.
          fontWeight: rtl ? 400 : 700,
          lineHeight: context.invoice ? 1.2 : 1.4,
          marginBottom: context.invoice ? 8 : 12,
          textAlign: rtl ? 'right' : 'left',
          color: headingColour,
        },
        minPresenceAhead: 75,
      },
      s,
    );
  const section = (title: string, children: React.ReactNode[]) =>
    el(
      View,
      { style: { marginTop: 15, marginBottom: 5 }, wrap: true },
      el(Text, { style: { fontSize: context.invoice ? 14 : 13, color: headingColour, fontWeight: rtl ? 400 : 700, marginBottom: 8, textAlign: rtl ? 'right' : 'left' }, minPresenceAhead: 60 }, title),
      ...children,
    );
  const clinicContact = [clinic.address, clinic.city, clinic.country, clinic.phone, clinic.email, clinic.website].filter(Boolean).join(' · ');
  const headerReserve = clinic.clinicName.length > 90 || clinicContact.length > 200 ? 145 : 112;
  const page = (key: string, children: React.ReactNode[]) =>
    el(
      Page,
      {
        key,
        size: 'A4',
        style: { fontFamily: font, fontSize: 11, color: '#183048', padding: 38, paddingTop: headerReserve, paddingBottom: 65 },
      },
      el(
        View,
        {
          fixed: true,
          style: {
            position: 'absolute', top: 28, left: 38, right: 38,
            borderBottomWidth: 1,
            borderBottomColor: '#d4e1e9',
            marginBottom: 14,
            paddingBottom: 10,
          },
        },
        el(View, { style: { flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center' } },
          logo && el(Image, { src: logo, style: { width: 80, height: 42, objectFit: 'contain', marginRight: rtl ? 0 : 14, marginLeft: rtl ? 14 : 0 } }),
          el(View, { style: { flex: 1 } },
            text(clinic.clinicName, clinic.clinicName.length > 60 ? 14 : 20),
            text(clinicContact, 9))),
      ),
      ...children,
      el(
        View,
        {
          fixed: true,
          style: {
            position: 'absolute',
            bottom: 25,
            left: 38,
            right: 38,
            flexDirection: 'row',
            justifyContent: 'space-between',
            height: 25,
          },
        },
        el(
          Text,
          { style: { fontSize: 7.5, maxWidth: '88%', lineHeight: 1.2 } },
          `${clinic.clinicName} · ${context.documentId ?? t.preview} · ${context.version ?? ''}`,
        ),
        el(Text, {
          style: { fontSize: 8 },
          render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`,
        }),
      ),
    );
  const signature = () => el(View, {
    wrap: false,
    style: { marginTop: 10, flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' },
  },
    el(View, { style: { width: '43%' } },
      ...[
        config.department && config.department !== 'International Patient Department' ? config.department : t.department,
        config.representative,
        context.generatedAt.slice(0, 10),
      ].filter(Boolean).map((value, index) => el(Text, { key: index, style: { fontSize: 8.5, lineHeight: 1.2, marginBottom: 2, textAlign: rtl ? 'right' : 'left' } }, value))),
    config.signature && el(Image, { src: config.signature, style: { width: 110, height: 42, objectFit: 'contain' } }),
    config.stamp && el(Image, { src: config.stamp, style: { width: 45, height: 45, objectFit: 'contain' } }),
    context.verificationQr && el(Image, { src: context.verificationQr, style: { width: 45, height: 45 } }),
  );
  const identity = () => [
    heading(
      context.kind === 'INVOICE' ? t.invoice : context.kind === 'WARRANTY' ? t.certificate : t.plan,
    ),
    text(`${t.patient}: ${patient.firstName} ${patient.lastName}`),
    el(View, { style: { flexDirection: rtl ? 'row-reverse' : 'row', marginBottom: 4 } },
      text(`${p.prepared}: `, 9), text(context.generatedAt.slice(0, 10), 9)),
    el(View, { style: { flexDirection: rtl ? 'row-reverse' : 'row', marginBottom: 4 } },
      text(`${p.reference}: `, 9), text(`${context.documentId ?? t.preview}${context.version ? ` · v${context.version}` : ''}`, 9)),
  ];
  const pages: React.ReactNode[] = [];
  if (context.invoice) {
    const inv = context.invoice;
    const figures = invoiceDisplayTotals(inv, inv.currency ?? plan.currency);
    const columns = [42, 11, 22, 25];
    const tableRow = (values: string[], bold = false) => el(View, {
      wrap: values.join('').length > 900,
      style: { flexDirection: rtl ? 'row-reverse' : 'row', paddingVertical: 8, borderBottomWidth: bold ? 1 : 0.5, borderBottomColor: '#d4e1e9', backgroundColor: bold ? '#f2f6fa' : '#ffffff' },
    }, ...values.map((value, i) => el(Text, { key: i, style: { width: columns[i] + '%', paddingHorizontal: 5, fontSize: 9, lineHeight: 1.4, fontWeight: bold ? 700 : 400, textAlign: i === 0 ? rtl ? 'right' : 'left' : 'right' } }, value)));
    const summaryRow = (label: string, value: number, emphasized = false) => el(View, { wrap: false, style: { flexDirection: rtl ? 'row-reverse' : 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#d4e1e9' } },
      el(Text, { style: { fontSize: emphasized ? 15 : 10, fontWeight: emphasized ? 700 : 400 } }, label),
      el(Text, { style: { fontSize: emphasized ? 15 : 10, fontWeight: emphasized ? 700 : 400 } }, money(value)));
    // Use explicit continuation pages so each block of invoice rows retains its column headings.
    const metadata = (label: string, value: string) => el(View, { style: { flexDirection: rtl ? 'row-reverse' : 'row', marginBottom: 2 } }, el(View, { style: { width: '48%' } }, text(label, 9)), el(View, { style: { width: '52%' } }, text(value, 9)));
    const chunks: typeof inv.items[] = [];
    let chunk: typeof inv.items = [], height = 0;
    for (const item of inv.items) {
      const estimated = 16 + Math.ceil(item.description.length / 40) * 13;
      if (chunk.length && height + estimated > (chunks.length === 0 ? 320 : 500)) { chunks.push(chunk); chunk = []; height = 0; }
      chunk.push(item); height += estimated;
    }
    if (chunk.length || !chunks.length) chunks.push(chunk);
    const paymentDetails = [
      figures.currencyReview && text(d.currencyReview, 10),
      section(d.paymentHistory, figures.payments.length ? figures.payments.map(p => text([
        documentDate(p.paidAt) || d.notSet, p.method?.replaceAll('_', ' '), money(Number(p.amount)), p.reference,
      ].filter(Boolean).join(' | '), 10)) : [text(`${t.paid}: ${money(0)}`, 10)]),
      (config.invoicePaymentInstructions || context.payment?.terms) && section(d.terms, [
        config.invoicePaymentInstructions && text(config.invoicePaymentInstructions),
        context.payment?.terms && text(context.payment.terms),
        text(`${d.reference}: ${inv.invoiceNumber}`, 10),
      ]),
      signature(),
    ];
    chunks.forEach((items, index) => pages.push(page('invoice-' + index, [
      heading(`${inv.status === 'DRAFT' ? d.draft + ' - ' : ''}${t.invoice} ${inv.invoiceNumber}`),
      text(invoiceStatusLabel(inv.status, plan.language), 10),
      index === 0 ? el(View, { wrap: false, style: { flexDirection: rtl ? 'row-reverse' : 'row', marginVertical: 10, padding: 12, backgroundColor: '#f2f6fa' } },
        el(View, { style: { width: '54%', paddingRight: 8 } },
          text(d.billFrom, 9), text(config.billingLegalName || clinic.clinicName, 11),
          config.billingTaxId && text(`${d.taxId}: ${config.billingTaxId}`, 9),
          text(d.billTo, 9), text(`${patient.firstName} ${patient.lastName}`, 11),
          [patient.email, patient.phone].filter(Boolean).length > 0 && text([patient.email, patient.phone].filter(Boolean).join(' | '), 9)),
        el(View, { style: { width: '46%' } },
          metadata(d.issued, documentDate(inv.issuedAt) || d.notIssued),
          metadata(d.due, documentDate(inv.dueDate) || d.notSet),
          metadata(d.generated, documentDate(context.generatedAt)),
          metadata(d.reference, inv.invoiceNumber))) : text(`${patient.firstName} ${patient.lastName}`, 10),
      tableRow([t.treatment, t.quantity, t.unitPrice, d.amount], true),
      ...items.map(i => tableRow([i.description, String(i.quantity), money(Number(i.unitPrice)), money(Number(i.total))])),
      index === chunks.length - 1 ? el(View, { wrap: false, style: { marginTop: 14, padding: 12, backgroundColor: '#f2f6fa' } },
        summaryRow(t.subtotal, Number(inv.subtotal)),
        summaryRow(t.discount, -Number(inv.discount)),
        summaryRow({ ar: 'الضريبة', fr: 'Taxe', de: 'Steuer', es: 'Impuesto', it: 'Imposta', tr: 'Vergi', pl: 'Podatek', hr: 'Porez', ru: 'Налог', en: 'Tax' }[plan.language], Number(inv.tax)),
        summaryRow(t.total, Number(inv.total), true),
        summaryRow(t.paid, figures.paid),
        summaryRow(t.balance, figures.balance, true),
        figures.credit > 0 && summaryRow(d.credit, figures.credit)) : null,
      ...(index === chunks.length - 1 ? paymentDetails : []),
    ])));
  } else if (context.warranty) {
    const w = context.warranty;
    pages.push(
      page('warranty', [
        ...identity(),
        text(w.certificateNumber),
        text(`${t.completion}: ${(w.completedAt ?? w.startDate).slice(0, 10)}`),
        text(w.description),
        w.positions && text(`FDI: ${w.positions}`),
        ...[w.material, w.brand, w.dentist].filter(Boolean).map((v) => text(v!)),
        text(
          `${t.warranty}: ${w.lifetime ? t.lifetime : w.durationMonths % 12 === 0 ? w.durationMonths / 12 + ' ' + t.years : w.durationMonths + ' ' + t.months}`,
        ),
        patient.diagnosis && section(t.diagnosis, [text(patient.diagnosis)]),
        text(t.contractual),
        text(w.termsAndConditions),
        w.maintenanceRequirements && section(t.maintenance, [text(w.maintenanceRequirements)]),
        w.exclusions && section(t.exclusions, [text(w.exclusions)]),
        signature(),
      ]),
    );
  } else {
    const priced = (value: number, unpriced = totals.unpriced) => unpriced ? p.toQuote : money(value);
    const fee = (label: string, value: string, prominent = false) => el(View, {
      wrap: false,
      style: { flexDirection: rtl ? 'row-reverse' : 'row', justifyContent: 'space-between', paddingVertical: prominent ? 8 : 2, borderBottomWidth: 0.5, borderBottomColor: '#d4e1e9' },
    }, el(Text, { style: { width: '60%', fontSize: prominent ? 13 : 9, lineHeight: 1.25, textAlign: rtl ? 'right' : 'left' } }, label), el(Text, { style: { width: '40%', fontSize: prominent ? 14 : 9, lineHeight: 1.25, textAlign: rtl ? 'left' : 'right' } }, value));
    const legend = () => el(View, {
      wrap: false, style: { flexDirection: rtl ? 'row-reverse' : 'row', flexWrap: 'wrap', marginBottom: 8 },
    }, ...([
      ['healthy', p.natural], ['missing', t.missing], ['extraction', p.plannedExtraction],
      ['implant', t.implant], ['crown', p.naturalCrown], ['implantCrown', p.implantCrown], ['existingCrown', t.existingCrown], ['unknown', t.unknown],
    ] as [ConsultationTooth, string][]).map(([state, label]) => {
      const layers = consultationToothGeometry('11', state);
      return el(View, { key: state, style: { width: '25%', flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', marginBottom: 3 } },
        el(Svg, { viewBox: '-30 -50 60 110', width: 16, height: 22, opacity: state === 'unknown' ? 0.4 : 1 },
          ...(state === 'missing' ? [el(Rect, { x: -15, y: -30, width: 30, height: 75, rx: 8, fill: 'none', stroke: '#788e99', strokeDasharray: '5 4' })] : [...ops(layers.subgingival), ...ops(layers.supragingival)])),
        el(Text, { style: { fontSize: 7.5, lineHeight: 1.25, width: 105, paddingHorizontal: 4, textAlign: rtl ? 'right' : 'left' } }, label));
    }));
    const medicalRows: [string, string | null | undefined][] = [
      [t.diagnosis, patient.diagnosis], [t.conditions, patient.medicalConditions], [t.medication, patient.medications],
      [t.allergies, patient.allergies], [t.previousSurgery, patient.previousSurgeries],
      [t.bloodThinners, patient.takesBloodThinners == null ? null : patient.takesBloodThinners ? t.yes : t.no],
      [t.pregnancy, patient.isPregnant == null ? null : patient.isPregnant ? t.yes : t.no],
      [t.smoking, patient.isSmoker == null ? null : patient.isSmoker ? t.yes : t.no],
    ];
    pages.push(page('intro', [
      ...identity(),
      el(Image, { src: config.coverPhoto || asset('clinic-cover.jpg'), style: { width: '100%', height: 125, objectFit: 'cover', marginBottom: 14 } }),
      text(p.estimate, 10),
      text(consultationTreatmentSummary(plan), consultationTreatmentSummary(plan).length > 250 ? 12 : 18),
      el(View, { wrap: false, style: { padding: 14, backgroundColor: accent, marginVertical: 10 } },
        text(`${t.total}: ${priced(totals.total)}`, 22, onAccent),
        ...totals.visits.map(visit => text(`${t.visit} ${visit.number}: ${priced(visit.total, visit.unpriced)}`, 10, onAccent))),
      text(t.confirmation, 9),
      section(t.journey, plan.visits.flatMap(visit => [
        text(`${t.visit} ${visit.number} · ${consultationVisitPurpose(plan, visit.number)}`, 10),
        text(`${p.days}: ${visit.treatmentDays ?? p.durationPending} · ${t.hotel}: ${visit.nights} ${t.nights}`, 9),
        ...(visit.number === 1 && plan.visits.length > 1 && plan.healing ? [text(`${t.healing}: ${plan.healing.minMonths}–${plan.healing.maxMonths} ${t.months}`, 9)] : []),
      ])),
      plan.visits.length > 1 && text(p.separateVisits, 9),
      section(p.nextSteps, [text(p.nextStepText, 9)]),
    ]));
    const appendix: React.ReactNode[] = [];
    for (const visit of plan.visits) {
      const lines = plan.lines.filter(line => line.visit === visit.number);
      const price = consultationVisitBreakdown(plan, visit.number);
      const journey = consultationItinerary(plan, visit.number);
      const compact = lines.length <= 2 && journey.length <= 10 && lines.every(line => (line.description?.length ?? 0) <= 250);
      const inlineEducation = !Object.keys(plan.findings).length && compact && journey.length <= 8 && new Set(lines.map(line => line.type)).size === 1 && lines.every(line => (line.description?.length ?? 0) <= 100 && (line.material?.length ?? 0) + (line.brand?.length ?? 0) < 80);
      const journeyRows: React.ReactNode[] = [];
      for (let i = 0; i < journey.length; i += 2) {
        const pair = journey.slice(i, i + 2);
        journeyRows.push(el(View, { key: i, wrap: pair.some(day => (day.text?.length ?? 0) > 300), style: { flexDirection: rtl ? 'row-reverse' : 'row', marginBottom: 4 } },
          ...pair.map(day => el(View, { key: day.day, style: { width: '50%', padding: inlineEducation ? 4 : 6, backgroundColor: '#f2f6fa', borderWidth: 2, borderColor: '#ffffff' } },
            text(`${t.day} ${day.day} · ${day.text ?? t[day.key === 'assessment' ? 'assessmentDay' : day.key!]}`, inlineEducation ? 8 : 9)))));
      }
      const education = [...new Set(lines.map(line => line.type))].map(type => {
        const relevant = lines.filter(line => line.type === type);
        const positions = relevant.flatMap(line => line.positions);
        const overlaps = (types: string[]) => plan.lines.some(line => types.includes(line.type) && line.positions.some(position => positions.includes(position)));
        const steps = procedureSteps(type, overlaps(['extraction']), overlaps(['temporary']), overlaps(['crown', 'implantCrown', 'bridge']));
        return el(View, { key: type, wrap: false, style: { marginTop: 6 } },
          text(`${t[type]} · ${procedureDescription(plan.language, type)}`, 9),
          el(View, { style: { flexDirection: rtl ? 'row-reverse' : 'row' } }, ...steps.map((step, index) => {
            const state: ConsultationTooth = step === 'implant' || step === 'implantCrown' ? step : step === 'extraction' ? 'extraction' : step === 'healing' ? (type === 'implantCrown' ? 'implant' : type) : step === 'fitting' || step === 'review' ? type : 'unknown';
            const layers = consultationToothGeometry('11', state);
            return el(View, { key: step, style: { width: `${100 / steps.length}%`, alignItems: 'center' } },
              el(Svg, { viewBox: '-35 -60 70 125', width: 40, height: 50 },
                el(Rect, { x: -35, y: 0, width: 70, height: 62, fill: '#f4e3c3' }),
                el(Line, { x1: -35, y1: 0, x2: 35, y2: 0, stroke: '#d5a1a4', strokeWidth: 5 }),
                ...ops(layers.subgingival), ...ops(layers.supragingival)),
              text(`${index + 1}. ${t[step]}`, 8));
          })));
      });
      // A short visit remains on one page. Extended explanations are placed in a named appendix.
      pages.push(page(`visit-${visit.number}`, [
        heading(`${t.visit} ${visit.number}`),
        text(consultationVisitPurpose(plan, visit.number), 10),
        text(`${p.proposed} · FDI · ${p.days}: ${visit.treatmentDays ?? p.durationPending} · ${visit.nights} ${t.nights}`, 9),
        ConsultationChartPdf(plan, visit.number, 'proposed', inlineEducation ? 155 : 180), legend(),
        ...unassignedConsultationUnits(plan, visit.number).map(line => text(`${p.positionsPending}: ${line.count} × ${t[line.type]}${line.jaw ? ` · ${t[line.jaw]}` : ''}`, 9)),
        ...lines.map(line => text(`${line.quantity} × ${t[line.type]}${line.positions.length ? ` · FDI ${line.positions.join(', ')}` : ''}${line.material || line.brand ? ` · ${[line.material, line.brand].filter(Boolean).join(' / ')}` : ''}`, 9)),
        fee(p.visitFee, priced(price.total, price.unpriced), true),
        text(`${t.hotel}: ${visit.nights} ${t.nights} · ${visit.hotelIncluded ? t.included : money(price.hotel)}`, 9),
        text(`${t.transfer}: ${visit.transfer === 'paid' ? money(price.transfer) : t[visit.transfer === 'included' ? 'included' : 'excluded']}`, 9),
        ...(compact ? [section(t.journey, journeyRows)] : []),
        ...(inlineEducation ? education : []),
        ...lines.filter(line => compact && line.description).map(line => text(`${p.clinicalNote}: ${line.description}`, 9)),
        visit.number === 1 && plan.visits.length > 1 && plan.healing ? text(`${t.healing}: ${plan.healing.minMonths}–${plan.healing.maxMonths} ${t.months}. ${p.healingText} ${p.separateVisits}`, 9) : null,
        !inlineEducation && text(t.confirmation, 8),
      ]));
      if (!compact) appendix.push(section(`${t.visit} ${visit.number} · ${t.journey}`, journeyRows));
      if (!inlineEducation) appendix.push(...education);
      if (!compact) appendix.push(...lines.filter(line => line.description).map(line => section(`${p.clinicalNote} · ${t.visit} ${line.visit} · ${t[line.type]}`, [text(line.description!, 10)])));
    }
    const columns = [38, 10, 18, 14, 20];
    const row = (values: string[], header = false) => el(View, {
      wrap: false, style: { flexDirection: rtl ? 'row-reverse' : 'row', backgroundColor: header ? '#f2f6fa' : '#ffffff', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: '#d4e1e9' },
    }, ...values.map((value, index) => el(Text, { key: index, style: { width: `${columns[index]}%`, paddingHorizontal: 4, fontSize: header ? 8 : 9, fontWeight: header && !rtl ? 700 : 400, lineHeight: 1.35, textAlign: index === 0 ? rtl ? 'right' : 'left' : 'right' } }, value)));
    const payment = context.payment;
    const hasOptions = payment?.cardFee != null || payment?.cashDiscount != null;
    const hasDeposit = payment?.depositAmount != null || payment?.depositPercent != null;
    const tableRows = plan.lines.map(line => [
      `${t.visit} ${line.visit} · ${t[line.type]}${line.material || line.brand ? '\n' + [line.material, line.brand].filter(Boolean).join(' / ') : ''}`,
      String(line.quantity), line.unitPrice == null ? p.toQuote : money(line.unitPrice), line.discount ? money(line.discount) : '—', line.unitPrice == null ? p.toQuote : money(Math.round((line.quantity * line.unitPrice - line.discount) * 100) / 100),
    ]);
    const tableHeader = () => row([t.treatment, t.quantity, t.unitPrice, t.discount, p.amount], true);
    // Reserve the financial summary page for totals; repeat column labels on each
    // explicit, balanced table page rather than allowing a headerless overflow.
    const rowHeight = (values: string[]) => 16 + Math.ceil(values[0].length / 31) * 13;
    const separateTable = tableRows.reduce((height, values) => height + rowHeight(values), 0) > 240;
    if (separateTable) {
      const chunks: string[][][] = [];
      let chunk: string[][] = [], height = 0;
      for (const values of tableRows) {
        const nextHeight = rowHeight(values);
        if (height + nextHeight > 510 && chunk.length) { chunks.push(chunk); chunk = []; height = 0; }
        chunk.push(values); height += nextHeight;
      }
      if (chunk.length) chunks.push(chunk);
      // Share the last short chunk with its predecessor when the combined table fits.
      if (chunks.length > 1) {
        const last = chunks[chunks.length - 1], previous = chunks[chunks.length - 2];
        if (last.length === 1 && [...previous, ...last].reduce((sum, values) => sum + rowHeight(values), 0) < 540) {
          previous.push(...last); chunks.pop();
        }
      }
      chunks.forEach((chunk, index) => pages.push(page(`treatment-table-${index}`, [heading(t.investment), text(p.estimate, 9), tableHeader(), ...chunk.map(values => row(values))])));
    }
    const investmentChildren: React.ReactNode[] = [
      heading(t.investment), text(p.estimate, 9),
      ...(!separateTable ? [tableHeader(), ...tableRows.map(values => row(values))] : []),
      el(View, { wrap: false, style: { flexDirection: rtl ? 'row-reverse' : 'row', marginTop: 12 } }, ...plan.visits.map(visit => {
        const price = consultationVisitBreakdown(plan, visit.number);
        return el(View, { key: visit.number, style: { width: plan.visits.length === 1 ? '100%' : '50%', padding: 8, backgroundColor: '#f2f6fa', borderWidth: 3, borderColor: '#ffffff' } },
          text(`${t.visit} ${visit.number}`, 11),
          fee(t.subtotal, priced(price.subtotal, price.unpriced)),
          price.discount > 0 && fee(t.discount, money(price.discount)),
          fee(`${t.hotel} · ${visit.nights} ${t.nights}`, visit.hotelIncluded ? t.included : money(price.hotel)),
          fee(t.transfer, visit.transfer === 'paid' ? money(price.transfer) : t[visit.transfer === 'included' ? 'included' : 'excluded']),
          fee(p.visitFee, priced(price.total, price.unpriced)));
      })),
      fee(t.total, priced(totals.total), true),
      plan.includedServices.length > 0 && section(t.included, plan.includedServices.map(service => text(service, 9))),
      payment && (hasOptions || hasDeposit || payment.terms) && section(t.payment, [
        !totals.unpriced && hasOptions && fee(`${p.cashTotal}${payment.cashDiscount ? ` · ${t.cashDiscount} ${payment.cashDiscount}%` : ''}`, priced(quotedPayment.cashTotal)),
        !totals.unpriced && hasOptions && fee(`${p.cardTotal}${payment.cardFee ? ` · ${t.cardFee} ${payment.cardFee}%` : ''}`, priced(quotedPayment.cardTotal)),
        !totals.unpriced && !!payment.cardFee && fee(p.cardExtra, priced(quotedPayment.cardExtra)),
        !totals.unpriced && hasDeposit && fee(p.depositRequested, priced(quotedPayment.deposit)),
        !totals.unpriced && hasDeposit && fee(p.remainingCash, priced(quotedPayment.remaining)),
        hasDeposit && !totals.unpriced && !!payment.cardFee && fee(p.remainingCard, priced(Math.round((quotedPayment.cardTotal - quotedPayment.deposit) * 100) / 100)),
        payment.terms && text(payment.terms, 9), text(p.quoteOnly, 8),
      ]),
      text(t.confirmation, 8),
    ];
    if (Object.keys(plan.findings).length) appendix.unshift(section(p.recorded, [ConsultationChartPdf(plan, 1, 'recorded'), legend()]));
    if (medicalRows.some(([, value]) => value)) appendix.push(section(t.medical, medicalRows.filter(([, value]) => value).map(([label, value]) => text(`${label}: ${value}`, 10))));
    if (config.warranties.some(warranty => plan.lines.some(line => line.type === warranty.type))) appendix.push(section(t.warranty, [
      ...config.warranties.filter(warranty => plan.lines.some(line => line.type === warranty.type)).map(warranty => text(`${t[warranty.type]} · ${warranty.summary}`, 10)), text(t.contractual, 9),
    ]));
    const inlineDetails = totals.unpriced && appendix.length === 1 && !Object.keys(plan.findings).length && plan.lines.length <= 2 && plan.visits.length === 1 && plan.includedServices.length <= 4 && (payment?.terms?.length ?? 0) < 250;
    if (inlineDetails) investmentChildren.push(section(p.clinicalNote, appendix), signature());
    if (!inlineDetails) investmentChildren.push(signature());
    pages.push(page('investment', investmentChildren));
    if (!inlineDetails && appendix.length) pages.push(page('clinical-details', [heading(p.clinicalNote), ...appendix, text(t.confirmation, 9)]));
  }

  return el(Document, {}, ...pages);
}

export async function renderConsultationPdf(context: DocumentContext): Promise<Buffer> {
  return renderToBuffer(consultationDocument(context) as never);
}
