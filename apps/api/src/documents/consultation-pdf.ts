import React from 'react';
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
  consultationWarnings,
  procedureSteps,
  UPPER_TEETH,
  LOWER_TEETH,
  type Consultation,
  type DocumentConfiguration,
  type DrawOp,
  type ConsultationCopyKey,
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
    payments: { amount: number | string; status: string }[];
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
export function ConsultationChartPdf(plan: Consultation, visit: number) {
  const state = consultationChart(plan, visit);
  return el(
    Svg,
    { viewBox: '0 0 640 265', width: 490, height: 203 },
    el(Rect, { x: 0, y: 0, width: 640, height: 66, rx: 15, fill: '#f4e3c3' }),
    el(Rect, { x: 0, y: 190, width: 640, height: 65, rx: 15, fill: '#f4e3c3' }),
    ...[UPPER_TEETH, LOWER_TEETH].flatMap((arch, a) =>
      arch.map((fdi, i) => {
        const layer = consultationToothLayers(plan, visit, fdi);
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
              x: x - 6,
              y: a === 0 ? 115 : 145,
              style: { fontSize: 9, fontFamily: 'Helvetica' },
              fill: '#253d51',
            },
            fdi,
          ),
        );
      }),
    ),
    ...consultationBridgeConnectors(plan, visit).map((segment, key) =>
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
  const totals = consultationTotals(plan);
  const font = rtl ? 'DejaVuSans' : 'NotoSans';
  const money = (v: number) =>
    `${plan.currency} ${v.toLocaleString(plan.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = (s: string, size = 11) =>
    el(
      Text,
      {
        style: {
          fontSize: size,
          lineHeight: 1.45,
          marginBottom: 6,
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
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1.4,
          marginBottom: 12,
          textAlign: rtl ? 'right' : 'left',
          color: '#12665d',
        },
        minPresenceAhead: 45,
      },
      s,
    );
  const section = (title: string, children: React.ReactNode[]) =>
    el(
      View,
      { style: { marginTop: 15, marginBottom: 5 }, wrap: true },
      heading(title),
      ...children,
    );
  const page = (key: string, children: React.ReactNode[]) =>
    el(
      Page,
      {
        key,
        size: 'A4',
        style: { fontFamily: font, fontSize: 11, color: '#183048', padding: 38, paddingBottom: 65 },
      },
      el(
        View,
        {
          style: {
            borderBottomWidth: 1,
            borderBottomColor: '#d4e1e9',
            marginBottom: 14,
            paddingBottom: 10,
          },
        },
        config.logo &&
          el(Image, { src: config.logo, style: { width: 90, height: 40, objectFit: 'contain' } }),
        text(clinic.clinicName, 20),
        text(
          [clinic.address, clinic.city, clinic.country, clinic.phone, clinic.email, clinic.website]
            .filter(Boolean)
            .join(' · '),
          9,
        ),
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
            height: 15,
          },
        },
        el(
          Text,
          { style: { fontSize: 8 } },
          `${clinic.clinicName} · ${context.documentId ?? t.preview} · ${context.version ?? ''}`,
        ),
        el(Text, {
          style: { fontSize: 8 },
          render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`,
        }),
      ),
    );
  const signature = () =>
    el(
      View,
      { wrap: false, style: { marginTop: 18 } },
      config.signature &&
        el(Image, {
          src: config.signature,
          style: { width: 140, height: 48, objectFit: 'contain' },
        }),
      config.stamp &&
        el(Image, { src: config.stamp, style: { width: 65, height: 65, objectFit: 'contain' } }),
      text(
        config.department && config.department !== 'International Patient Department'
          ? config.department
          : t.department,
      ),
      config.representative && text(config.representative),
      text(context.generatedAt.slice(0, 10), 9),
      context.verificationQr &&
        el(Image, { src: context.verificationQr, style: { width: 65, height: 65 } }),
    );
  const identity = () => [
    heading(
      context.kind === 'INVOICE' ? t.invoice : context.kind === 'WARRANTY' ? t.certificate : t.plan,
    ),
    text(`${t.patient}: ${patient.firstName} ${patient.lastName}`),
    text([patient.phone, context.generatedAt.slice(0, 10)].filter(Boolean).join(' · '), 9),
  ];
  const pages: React.ReactNode[] = [];
  if (context.invoice) {
    const inv = context.invoice,
      paid = inv.payments
        .filter((p) => p.status === 'COMPLETED')
        .reduce((s, p) => s + Number(p.amount), 0);
    pages.push(
      page('invoice', [
        ...identity(),
        text(`${inv.invoiceNumber} · ${inv.status}`),
        ...inv.items.map((i) =>
          el(
            View,
            {
              wrap: false,
              style: {
                flexDirection: 'row',
                paddingVertical: 5,
                borderBottomWidth: 0.5,
                borderBottomColor: '#d4e1e9',
              },
            },
            el(Text, { style: { width: '55%' } }, i.description),
            el(Text, { style: { width: '20%' } }, `${i.quantity} × ${money(Number(i.unitPrice))}`),
            el(Text, { style: { width: '25%', textAlign: 'right' } }, money(Number(i.total))),
          ),
        ),
        text(`${t.subtotal}: ${money(Number(inv.subtotal))}`),
        text(`${t.discount}: ${money(Number(inv.discount))}`),
        text(
          `${{ ar: 'الضريبة', fr: 'Taxe', de: 'Steuer', es: 'Impuesto', it: 'Imposta', tr: 'Vergi', pl: 'Podatek', hr: 'Porez', ru: 'Налог', en: 'Tax' }[plan.language]}: ${money(Number(inv.tax))}`,
        ),
        text(`${t.total}: ${money(Number(inv.total))}`, 18),
        text(`${t.paid}: ${money(paid)}`),
        text(`${t.balance}: ${money(Math.max(0, Number(inv.total) - paid))}`),
        signature(),
      ]),
    );
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
    const cover = config.coverPhoto || asset('clinic-cover.jpg');
    pages.push(
      page('intro', [
        ...identity(),
        cover &&
          el(Image, {
            src: cover,
            style: { width: '100%', height: 190, objectFit: 'cover', marginBottom: 12 },
          }),
        text(plan.treatmentText, 18),
        text(t.confirmation),
        ...[
          patient.diagnosis ? section(t.diagnosis, [text(patient.diagnosis)]) : null,
          [
            patient.medicalConditions,
            patient.medications,
            patient.allergies,
            patient.previousSurgeries,
          ].some(Boolean) ||
          [patient.takesBloodThinners, patient.isPregnant, patient.isSmoker].some(
            (value) => value != null,
          )
            ? section(
                t.medical,
                [
                  [t.conditions, patient.medicalConditions],
                  [t.medication, patient.medications],
                  [t.allergies, patient.allergies],
                  [t.previousSurgery, patient.previousSurgeries],
                  [
                    t.bloodThinners,
                    patient.takesBloodThinners == null
                      ? null
                      : patient.takesBloodThinners
                        ? t.yes
                        : t.no,
                  ],
                  [
                    t.pregnancy,
                    patient.isPregnant == null ? null : patient.isPregnant ? t.yes : t.no,
                  ],
                  [t.smoking, patient.isSmoker == null ? null : patient.isSmoker ? t.yes : t.no],
                ]
                  .filter((row) => row[1])
                  .map((row) => text(row[0] + ': ' + row[1])),
              )
            : null,
        ],
        ...consultationWarnings(plan).map((k) => text(t[k as ConsultationCopyKey], 10)),
        section(
          t.journey,
          plan.visits.flatMap((v) => [
            text(
              `${t.visit} ${v.number} · ${v.nights} ${t.nights} · ${totals.visits.find((total) => total.number === v.number)!.unpriced ? t.unpriced : money(totals.visits.find((total) => total.number === v.number)!.total)}`,
            ),
            ...(v.number === 1 && plan.visits.length > 1 && plan.healing
              ? [
                  text(
                    `${t.healing}: ${plan.healing.minMonths}-${plan.healing.maxMonths} ${t.months}`,
                  ),
                ]
              : []),
          ]),
        ),
      ]),
    );
    for (const visit of plan.visits) {
      const items = plan.lines.filter((l) => l.visit === visit.number),
        price = totals.visits.find((v) => v.number === visit.number)!;
      pages.push(
        page(`visit-${visit.number}`, [
          heading(`${t.visit} ${visit.number}`),
          ConsultationChartPdf(plan, visit.number),
          text(
            `${t.unknown} · FDI · ${t.implant} / ${t.implantCrown} / ${t.crown} / ${t.veneer}`,
            8,
          ),
          ...unassignedConsultationUnits(plan, visit.number).map((line) => {
            const layers = consultationToothGeometry('11', line.type);
            return el(
              View,
              { wrap: false, key: 'unassigned-' + line.id },
              text(`${t[line.type]} · ${line.count} · ${line.jaw ? t[line.jaw] : t.unassigned}`, 9),
              el(
                Svg,
                {
                  viewBox: `0 0 600 ${Math.ceil(line.count / 12) * 68}`,
                  width: 490,
                  height: Math.ceil(line.count / 12) * 55,
                },
                ...Array.from({ length: line.count }, (_, i) =>
                  el(
                    G,
                    {
                      key: i,
                      transform: `translate(${25 + (i % 12) * 50},${25 + Math.floor(i / 12) * 68}) scale(0.45)`,
                    },
                    el(Rect, { x: -35, y: 0, width: 70, height: 58, fill: '#f4e3c3' }),
                    ...ops(layers.subgingival),
                    ...ops(layers.supragingival),
                  ),
                ),
              ),
            );
          }),
          ...items.map((l) =>
            text(
              `${l.quantity} × ${t[l.type]}${l.jaw ? ` · ${t[l.jaw]}` : ''}${l.positions.length ? ' · FDI ' + l.positions.join(', ') : ' · ' + t.unassigned}${l.material ? ' · ' + l.material : ''}${l.brand ? ' · ' + l.brand : ''}`,
            ),
          ),
          section(
            t.journey,
            consultationItinerary(plan, visit.number).map((d) =>
              text(
                `${t.day} ${d.day} · ${d.text ?? t[d.key === 'assessment' ? 'assessmentDay' : d.key!]}`,
              ),
            ),
          ),
          text(
            `${t.hotel}: ${visit.nights} × ${money(visit.hotelRate)} · ${visit.hotelIncluded ? t.included : money(price.hotel)}`,
          ),
          text(
            `${t.transfer}: ${t[visit.transfer === 'paid' ? 'paid' : visit.transfer === 'included' ? 'included' : 'excluded']} · ${money(price.transfer)}`,
          ),
          text(
            `${t.visit} ${visit.number}: ${price.unpriced ? t.unpriced : money(price.total)}`,
            17,
          ),
        ]),
      );
    }
    const procedureBlocks = [...new Set(plan.lines.map((l) => l.type))].map((type) =>
      section(t[type], [
        text(procedureDescription(plan.language, type)),
        ...plan.lines
          .filter((l) => l.type === type && l.description)
          .map((l) => text(l.description!)),
        el(
          View,
          { wrap: false, style: { flexDirection: rtl ? 'row-reverse' : 'row', marginTop: 8 } },
          ...procedureSteps(
            type,
            plan.lines.some((l) => l.type === 'extraction'),
            plan.lines.some((l) => l.type === 'temporary'),
            plan.lines.some((l) => ['crown', 'implantCrown', 'bridge'].includes(l.type)),
          ).map((step, i) => {
            const diagramType =
              step === 'implant'
                ? 'implant'
                : step === 'implantCrown'
                  ? 'implantCrown'
                  : step === 'extraction'
                    ? 'missing'
                    : step === 'fitting' || ['sinus', 'graft', 'rootCanal'].includes(step)
                      ? type
                      : 'unknown';
            const layers = consultationToothGeometry(
              '11',
              step === 'healing'
                ? type === 'implant' || type === 'implantCrown'
                  ? 'implant'
                  : type
                : step === 'review'
                  ? type === 'extraction'
                    ? 'missing'
                    : type
                  : (diagramType as Parameters<typeof consultationToothGeometry>[1]),
            );
            return el(
              View,
              { key: step, style: { width: '25%', padding: 5 } },
              el(
                Svg,
                { viewBox: '-35 -60 70 125', width: 85, height: 94 },
                el(Rect, { x: -35, y: 0, width: 70, height: 62, fill: '#f4e3c3' }),
                el(Line, { x1: -35, y1: 0, x2: 35, y2: 0, stroke: '#d5a1a4', strokeWidth: 5 }),
                ...ops(layers.subgingival),
                ...ops(layers.supragingival),
              ),
              text(`${i + 1}. ${t[step]}`, 9),
            );
          }),
        ),
      ]),
    );
    pages.push(page('education', [heading(t.process), ...procedureBlocks, text(t.confirmation)]));
    pages.push(
      page('investment', [
        heading(t.investment),
        ...plan.lines.map((l) =>
          text(
            `${t.visit} ${l.visit} · ${t[l.type]} · ${l.quantity} × ${l.unitPrice == null ? t.unpriced : money(l.unitPrice)}${l.discount ? ' − ' + money(l.discount) : ''} = ${l.unitPrice == null ? t.unpriced : money(l.quantity * l.unitPrice - l.discount)}`,
          ),
        ),
        ...totals.visits.map((v) =>
          text(
            `${t.visit} ${v.number} · ${t.treatment} ${money(v.treatments)} · ${t.hotel} ${money(v.hotel)} · ${t.transfer} ${money(v.transfer)} · ${t.total} ${money(v.total)}`,
          ),
        ),
        text(`${t.total}: ${totals.unpriced ? t.unpriced : money(totals.total)}`, 22),
        section(
          t.included,
          plan.includedServices.length ? plan.includedServices.map((s) => text(s)) : [text('—')],
        ),
        section(
          t.warranty,
          config.warranties
            .filter((w) => plan.lines.some((l) => l.type === w.type))
            .map((w) => text(`${t[w.type]} · ${w.summary}`)),
        ),
        text(t.contractual),
        context.payment &&
          section(t.payment, [
            context.payment.terms && text(context.payment.terms),
            context.payment.cardFee != null && text(`${t.cardFee}: ${context.payment.cardFee}%`),
            context.payment.cashDiscount != null &&
              text(`${t.cashDiscount}: ${context.payment.cashDiscount}%`),
            (context.payment.depositAmount != null || context.payment.depositPercent != null) &&
              text(
                `${t.deposit}: ${money(context.payment.depositAmount ?? Math.round(totals.total * context.payment.depositPercent!) / 100)}`,
              ),
          ]),
        text(t.confirmation),
        signature(),
      ]),
    );
  }
  return el(Document, {}, ...pages);
}

export async function renderConsultationPdf(context: DocumentContext): Promise<Buffer> {
  return renderToBuffer(consultationDocument(context) as never);
}
