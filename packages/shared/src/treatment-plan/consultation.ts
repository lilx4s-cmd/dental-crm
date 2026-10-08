import { z } from 'zod';
import { CONSULTATION_COPY } from './consultation-copy';
import {
  ALL_TEETH,
  UPPER_TEETH,
  LOWER_TEETH,
  buildTooth,
  buildToothMarker,
  type ToothLayers,
} from '../dental/tooth-geometry';

export const DOCUMENT_LANGUAGES = [
  'en',
  'ar',
  'fr',
  'tr',
  'de',
  'es',
  'it',
  'pl',
  'hr',
  'ru',
] as const;
export const PROCEDURES = [
  'implant',
  'crown',
  'veneer',
  'extraction',
  'sinus',
  'graft',
  'rootCanal',
  'bridge',
  'temporary',
  'implantCrown',
] as const;
export type Procedure = (typeof PROCEDURES)[number];
const money = z
  .number()
  .finite()
  .min(0)
  .max(10000000)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001,
    'Use at most two decimal places',
  );
const currencies = new Set(
  (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.(
    'currency',
  ) ?? ['USD', 'EUR', 'GBP', 'TRY'],
);
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((v) => currencies.has(v), 'Use a supported ISO currency');
const tooth = z.string().refine((v) => ALL_TEETH.includes(v), 'Use an adult FDI tooth number');
export const ConsultationLineSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(PROCEDURES),
    quantity: z.number().int().min(1).max(32),
    unitPrice: money.nullable(),
    overrideReason: z.string().max(1000).optional(),
    positions: z.array(tooth).max(32).default([]),
    jaw: z.enum(['upper', 'lower']).optional(),
    visit: z.number().int().min(1).max(2),
    material: z.string().max(120).optional(),
    brand: z.string().max(120).optional(),
    description: z.string().max(2500).optional(),
    discount: money.default(0),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.positions).size !== v.positions.length || v.positions.length > v.quantity)
      ctx.addIssue({
        code: 'custom',
        path: ['positions'],
        message: 'Positions must be unique and cannot exceed quantity',
      });
    if (v.jaw && v.positions.some((p) => (['1', '2'].includes(p[0]) ? 'upper' : 'lower') !== v.jaw))
      ctx.addIssue({
        code: 'custom',
        path: ['positions'],
        message: 'Positions do not belong to the selected jaw',
      });
    if (v.unitPrice != null && v.discount > v.quantity * v.unitPrice)
      ctx.addIssue({
        code: 'custom',
        path: ['discount'],
        message: 'Discount exceeds the treatment amount',
      });
  });
export const ConsultationVisitSchema = z.object({
  number: z.number().int().min(1).max(2),
  treatmentDays: z.number().int().min(1).max(61).optional(),
  nights: z.number().int().min(0).max(60),
  hotelRate: money,
  hotelIncluded: z.boolean(),
  transfer: z.enum(['included', 'excluded', 'paid']),
  transferPrice: money,
  itinerary: z
    .array(z.object({ day: z.number().int().min(1).max(61), text: z.string().min(1).max(1200) }))
    .max(61)
    .default([]),
});
export const ConsultationSchema = z
  .object({
    version: z.literal(1),
    language: z.enum(DOCUMENT_LANGUAGES),
    currency,
    treatmentText: z.string().min(1).max(2500),
    lines: z.array(ConsultationLineSchema).min(1).max(64),
    visits: z.array(ConsultationVisitSchema).min(1).max(2),
    healing: z
      .object({
        minMonths: z.number().int().min(0).max(36),
        maxMonths: z.number().int().min(0).max(36),
      })
      .nullable(),
    includedServices: z.array(z.string().max(100)).max(25).default([]),
    findings: z
      .record(tooth, z.enum(['unknown', 'healthy', 'missing', 'existingCrown']))
      .default({}),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.lines.map((l) => l.id)).size !== v.lines.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate treatment line' });
    if (
      new Set(v.visits.map((l) => l.number)).size !== v.visits.length ||
      !v.visits.some((l) => l.number === 1)
    )
      ctx.addIssue({ code: 'custom', message: 'Visits must be unique and start at visit 1' });
    for (const line of v.lines)
      if (!v.visits.some((visit) => visit.number === line.visit))
        ctx.addIssue({ code: 'custom', message: 'Treatment references a missing visit' });
    if (v.healing && v.healing.maxMonths < v.healing.minMonths)
      ctx.addIssue({ code: 'custom', message: 'Invalid healing interval' });
    for (const visit of v.visits)
      if (
        visit.itinerary.some((i) => i.day > visit.nights + 1) ||
        new Set(visit.itinerary.map((i) => i.day)).size !== visit.itinerary.length
      )
        ctx.addIssue({ code: 'custom', message: 'Itinerary days must be unique and fit the stay' });
    const occupied = new Set<string>();
    for (const line of v.lines)
      for (const position of line.positions) {
        const key = `${line.visit}:${line.type}:${position}`;
        if (occupied.has(key))
          ctx.addIssue({
            code: 'custom',
            message: 'Duplicate treatment on a tooth in the same visit',
          });
        occupied.add(key);
        const sameVisit = v.lines.filter(
          (l) => l.visit === line.visit && l.positions.includes(position),
        );
        if (
          ['crown', 'veneer', 'bridge', 'implantCrown', 'temporary'].includes(line.type) &&
          sameVisit.some(
            (l) =>
              l.id !== line.id &&
              ['crown', 'veneer', 'bridge', 'implantCrown', 'temporary'].includes(l.type) &&
              !['temporary'].includes(l.type) &&
              line.type !== 'temporary',
          )
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Conflicting final restorations on the same tooth',
          });
        if (
          line.type === 'implant' &&
          v.findings[position] === 'healthy' &&
          !v.lines.some(
            (l) =>
              l.type === 'extraction' && l.visit <= line.visit && l.positions.includes(position),
          )
        )
          ctx.addIssue({
            code: 'custom',
            message: 'Record extraction before placing an implant on a healthy tooth',
          });
        if (
          ['crown', 'veneer'].includes(line.type) &&
          v.findings[position] === 'missing' &&
          !v.lines.some(
            (l) => l.type === 'implant' && l.visit <= line.visit && l.positions.includes(position),
          )
        )
          ctx.addIssue({
            code: 'custom',
            message: 'A missing tooth needs a recorded supporting treatment',
          });
      }
  });
export type Consultation = z.infer<typeof ConsultationSchema>;
export type ConsultationLine = z.infer<typeof ConsultationLineSchema>;
export const DocumentConfigurationSchema = z
  .object({
    department: z.string().max(120).default('International Patient Department'),
    representative: z.string().max(120).optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#183858'),
    billingLegalName: z.string().max(180).optional(),
    billingTaxId: z.string().max(120).optional(),
    invoicePaymentInstructions: z.string().max(2000).optional(),
    signature: z.string().max(350000).optional(),
    stamp: z.string().max(350000).optional(),
    logo: z.string().max(350000).optional(),
    coverPhoto: z.string().max(350000).optional(),
    priceList: z
      .array(
        z.object({
          type: z.enum(PROCEDURES),
          currency,
          unitPrice: money,
          material: z.string().max(120).optional(),
          brand: z.string().max(120).optional(),
        }),
      )
      .max(100)
      .default([]),
    healing: z
      .object({
        minMonths: z.number().int().min(0).max(36),
        maxMonths: z.number().int().min(0).max(36),
      })
      .nullable()
      .default(null),
    defaultNights: z.array(z.number().int().min(0).max(60)).max(2).default([0, 0]),
    defaultHotelRate: money.default(0),
    defaultHotelIncluded: z.boolean().default(false),
    services: z.array(z.string().max(100)).max(25).default([]),
    warranties: z
      .array(
        z.object({
          type: z.enum(PROCEDURES),
          duration: z.enum(['lifetime', 'months']),
          months: z.number().int().min(1).max(1200).optional(),
          summary: z.string().min(1).max(2500),
        }),
      )
      .max(20)
      .default([]),
  })
  .superRefine((v, ctx) => {
    for (const key of ['signature', 'stamp', 'logo', 'coverPhoto'] as const)
      if (v[key] && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v[key]!))
        ctx.addIssue({ code: 'custom', path: [key], message: 'Upload a PNG or JPEG image' });
    if (
      new Set(v.priceList.map((l) => l.type + l.currency + (l.material ?? '').toLowerCase()))
        .size !== v.priceList.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate price list entry' });
    if (new Set(v.warranties.map((l) => l.type)).size !== v.warranties.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate warranty summary' });
    if (v.healing && v.healing.maxMonths < v.healing.minMonths)
      ctx.addIssue({ code: 'custom', message: 'Invalid healing interval' });
    if (v.warranties.some((w) => w.duration === 'months' && !w.months))
      ctx.addIssue({ code: 'custom', message: 'Specify warranty duration in months' });
  });
export type DocumentConfiguration = z.infer<typeof DocumentConfigurationSchema>;
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function consultationTotals(plan: Consultation) {
  const visits = plan.visits.map((v) => {
    const treatments = round(
      plan.lines
        .filter((l) => l.visit === v.number)
        .reduce((s, l) => s + (l.unitPrice ?? 0) * l.quantity - l.discount, 0),
    );
    const hotel = v.hotelIncluded ? 0 : round(v.nights * v.hotelRate);
    const transfer = v.transfer === 'paid' ? v.transferPrice : 0;
    return {
      number: v.number,
      treatments,
      hotel,
      transfer,
      total: round(treatments + hotel + transfer),
      unpriced: plan.lines.some((l) => l.visit === v.number && l.unitPrice === null),
    };
  });
  return {
    visits,
    total: round(visits.reduce((s, v) => s + v.total, 0)),
    unpriced: visits.some((v) => v.unpriced),
  };
}

/** Deterministic parsing. Quantities/jaws are read; positions are never inferred. */
export function parseConsultation(
  text: string,
  currency: string,
  config: DocumentConfiguration,
): { lines: ConsultationLine[]; warnings: string[] } {
  const lines: ConsultationLine[] = [],
    warnings: string[] = [];
  const normalized = text.replace(/[٠-٩۰-۹]/g, (c) =>
    String(c.charCodeAt(0) - (c.charCodeAt(0) >= 0x6f0 ? 0x6f0 : 0x660)),
  );
  const chunks = normalized
    .replace(/\band\b/gi, '+')
    .split(/[+;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const surgical = /implants?|all[ -]?on[ -]?[46]|زرع|implantat|impiant|имплант/i.test(normalized);
  for (const chunk of chunks) {
    const allOn = /all[ -]?on[ -]?([46])/i.exec(chunk);
    const translated = (
      [
        'implantCrown',
        'temporary',
        'rootCanal',
        'extraction',
        'sinus',
        'graft',
        'bridge',
        'veneer',
        'crown',
        'implant',
      ] as Procedure[]
    ).find((type) =>
      Object.values(CONSULTATION_COPY).some((copy) =>
        chunk.toLocaleLowerCase().includes(copy[type].toLocaleLowerCase()),
      ),
    );
    const type: Procedure | undefined = allOn
      ? 'implant'
      : (translated ??
        (/implant\s*crown/i.test(chunk)
          ? 'implantCrown'
          : /implants?/i.test(chunk)
            ? 'implant'
            : /veneers?/i.test(chunk)
              ? 'veneer'
              : /temporary|provisional/i.test(chunk)
                ? 'temporary'
                : /crowns?/i.test(chunk)
                  ? 'crown'
                  : /extract/i.test(chunk)
                    ? 'extraction'
                    : /sinus/i.test(chunk)
                      ? 'sinus'
                      : /graft/i.test(chunk)
                        ? 'graft'
                        : /root\s*canal/i.test(chunk)
                          ? 'rootCanal'
                          : /bridge/i.test(chunk)
                            ? 'bridge'
                            : undefined));
    if (!type) {
      warnings.push(chunk);
      continue;
    }
    const positions = [...chunk.matchAll(/\b([1-4][1-8])\b/g)].map((m) => m[1]);
    const explicitFdi = /\b(tooth|teeth|fdi|positions?)\b/i.test(chunk);
    const quantityMatch = /^\s*(\d+)\b/.exec(chunk);
    const quantity = allOn
      ? Number(allOn[1])
      : quantityMatch
        ? Number(quantityMatch[1])
        : explicitFdi && positions.length
          ? positions.length
          : 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 32) {
      warnings.push(chunk);
      continue;
    }
    const jaws: ('upper' | 'lower' | undefined)[] =
      allOn && /both/i.test(chunk)
        ? ['upper', 'lower']
        : [
            /upper|supérieur|superior|oberkiefer|üst|علوي|العلوي|верхн|gornj|górn/i.test(chunk)
              ? 'upper'
              : /lower|inférieur|inferior|unterkiefer|alt|سفلي|السفلي|нижн|donj|doln/i.test(chunk)
                ? 'lower'
                : undefined,
          ];
    const requestedMaterial = /e[. -]?max/i.test(chunk)
      ? 'E.max'
      : /zircon|zirkon|زركون/i.test(chunk)
        ? 'Zirconia'
        : undefined;
    const materialKey = (v: string) => v.toLowerCase().replace(/[. -]/g, '');
    const price = config.priceList.find(
      (p) =>
        p.type === type &&
        p.currency === currency &&
        (!requestedMaterial ||
          !p.material ||
          materialKey(p.material) === materialKey(requestedMaterial)),
    );
    for (const jaw of jaws)
      lines.push({
        id: `line-${lines.length + 1}`,
        type,
        quantity,
        unitPrice: price?.unitPrice ?? null,
        material: requestedMaterial ?? price?.material,
        brand: price?.brand,
        positions: explicitFdi ? [...new Set(positions)] : [],
        jaw,
        visit: surgical && ['crown', 'veneer', 'implantCrown', 'bridge'].includes(type) ? 2 : 1,
        discount: 0,
      });
  }
  return { lines, warnings };
}

export type ConsultationTooth =
  'unknown' | 'healthy' | 'missing' | 'existingCrown' | 'bridgePontic' | Procedure;
export type ConsultationChartMode = 'recorded' | 'proposed';
export function consultationChart(
  plan: Consultation,
  visit: number,
  mode: ConsultationChartMode = 'proposed',
): Record<string, ConsultationTooth> {
  const map: Record<string, ConsultationTooth> = { ...plan.findings };
  if (mode === 'recorded') return map;
  const order: Record<Procedure, number> = {
    extraction: 0,
    sinus: 1,
    graft: 1,
    rootCanal: 2,
    implant: 3,
    temporary: 4,
    crown: 5,
    veneer: 5,
    bridge: 5,
    implantCrown: 5,
  };
  // Preserve the surgical implant when the later restoration is a bridge/crown.
  for (const line of [...plan.lines].sort(
    (a, b) => a.visit - b.visit || order[a.type] - order[b.type],
  ))
    if (line.visit <= visit)
      for (const tooth of line.positions) {
        if (
          ['crown', 'bridge', 'implantCrown'].includes(line.type) &&
          ['implant', 'implantCrown'].includes(map[tooth])
        )
          map[tooth] = 'implantCrown';
        else if (line.type === 'bridge' && map[tooth] === 'missing') map[tooth] = 'bridgePontic';
        else map[tooth] = line.type;
      }
  return map;
}
/** Layer bone procedures and treated canals without replacing their recorded restoration. */
export function consultationToothLayers(
  plan: Consultation,
  visit: number,
  fdi: string,
  mode: ConsultationChartMode = 'proposed',
): ToothLayers {
  const state = consultationChart(plan, visit, mode)[fdi] ?? 'unknown';
  const layers = consultationToothGeometry(fdi, state);
  if (mode === 'recorded') return layers;
  const types = plan.lines
    .filter((l) => l.visit <= visit && l.positions.includes(fdi))
    .map((l) => l.type);
  if (types.includes('rootCanal') && ['crown', 'bridge', 'temporary'].includes(state))
    layers.subgingival = buildTooth(fdi, 'ROOT_CANAL', 'diagnosis').subgingival;
  const naturalRootCount = buildTooth(fdi, 'HEALTHY', 'diagnosis').subgingival.length;
  for (const type of ['sinus', 'graft'] as const)
    if (types.includes(type) && state !== type) {
      const overlay = buildTooth(
        fdi,
        type === 'sinus' ? 'SINUS_LIFT' : 'BONE_GRAFT',
        'diagnosis',
      ).subgingival.slice(naturalRootCount);
      layers.subgingival = [...overlay, ...layers.subgingival];
    }
  return layers;
}
export function consultationBridgeConnectors(plan: Consultation, visit: number, mode: ConsultationChartMode = 'proposed') {
  const result: { x1: number; x2: number; y: number }[] = [];
  if (mode === 'recorded') return result;
  for (const line of plan.lines.filter((l) => l.type === 'bridge' && l.visit <= visit))
    for (const [a, arch] of [UPPER_TEETH, LOWER_TEETH].entries())
      for (let i = 0; i < arch.length - 1; i++) {
        if (line.positions.includes(arch[i]) && line.positions.includes(arch[i + 1]))
          result.push({
            x1: 20 + i * 39 + (i >= 8 ? 8 : 0),
            x2: 20 + (i + 1) * 39 + (i + 1 >= 8 ? 8 : 0),
            y: a === 0 ? 85 : 170,
          });
      }
  return result;
}
export function consultationToothGeometry(fdi: string, state: ConsultationTooth): ToothLayers {
  if (state === 'missing') return { subgingival: [], supragingival: [] };
  if (state === 'extraction') {
    const layers = buildTooth(fdi, 'HEALTHY', 'diagnosis');
    return { ...layers, supragingival: [...layers.supragingival, ...buildToothMarker('EXTRACTION', 'diagnosis').map(op => ({ ...op, stroke: '#b42332' }))] };
  }
  if (state === 'implant' || state === 'implantCrown') {
    const layers = buildTooth(fdi, 'IMPLANT', 'diagnosis');
    return {
      subgingival: layers.subgingival,
      supragingival:
        state === 'implant'
          ? []
          : [
              { kind: 'rect', x: -3, y: -10, width: 6, height: 12, fill: '#8c99a4' },
              ...layers.supragingival,
            ],
    };
  }
  if (state === 'bridgePontic') {
    const layers = buildTooth(fdi, 'BRIDGE', 'plan');
    return { subgingival: [], supragingival: layers.supragingival };
  }
  const condition =
    state === 'sinus'
      ? 'SINUS_LIFT'
      : state === 'graft'
        ? 'BONE_GRAFT'
        : state === 'rootCanal'
          ? 'ROOT_CANAL'
          : state === 'existingCrown' || state === 'temporary'
            ? 'CROWN'
            : state === 'crown'
              ? 'CROWN'
              : state === 'veneer'
                ? 'VENEER'
                : state === 'bridge'
                  ? 'BRIDGE'
                  : 'HEALTHY';
  const layers = buildTooth(fdi, condition, 'diagnosis');
  if (['crown', 'temporary', 'veneer', 'bridge'].includes(state)) {
    layers.supragingival = layers.supragingival.map((op) =>
      op.kind === 'path' && op.fill && op.fill !== 'none'
        ? { ...op, fill: '#f7f4ec', stroke: '#788e99' }
        : op,
    );
  }
  return layers;
}
export type ItineraryKey =
  | 'arrival'
  | 'assessment'
  | 'surgery'
  | 'review'
  | 'preparation'
  | 'laboratory'
  | 'fitting'
  | 'departure'
  | 'rootCanal';
function itinerarySequence(plan: Consultation, visit: number): ItineraryKey[] {
  const types = plan.lines.filter((l) => l.visit === visit).map((l) => l.type);
  if (types.some((type) => ['implant', 'extraction', 'sinus', 'graft'].includes(type)))
    return [
      'arrival',
      'assessment',
      ...(types.includes('rootCanal') ? ['rootCanal' as const] : []),
      'surgery',
      'review',
      'departure',
    ];
  if (types.some((type) => ['crown', 'implantCrown', 'veneer', 'bridge'].includes(type)))
    return [
      'arrival',
      'assessment',
      ...(types.includes('rootCanal') ? ['rootCanal' as const] : []),
      'preparation',
      'laboratory',
      'fitting',
      'review',
      'departure',
    ];
  if (types.includes('rootCanal'))
    return ['arrival', 'assessment', 'rootCanal', 'review', 'departure'];
  if (types.includes('temporary'))
    return ['arrival', 'assessment', 'preparation', 'fitting', 'review', 'departure'];
  return ['arrival', 'assessment', 'review', 'departure'];
}
/** N nights means N+1 days. Short stays warn; they never silently compress clinical work. */
export function consultationItinerary(
  plan: Consultation,
  visit: number,
): { day: number; key?: ItineraryKey; text?: string }[] {
  const v = plan.visits.find((v) => v.number === visit)!;
  if (v.itinerary.length) return v.itinerary.map((i) => ({ day: i.day, text: i.text }));
  const sequence = itinerarySequence(plan, visit);
  if (v.nights + 1 < sequence.length)
    return Array.from({ length: v.nights + 1 }, (_, i) => ({
      day: i + 1,
      key: i === 0 ? 'arrival' : i === v.nights ? 'departure' : 'review',
    }));
  return Array.from({ length: v.nights + 1 }, (_, i) => ({
    day: i + 1,
    key: i === v.nights ? 'departure' : sequence[Math.min(i, sequence.length - 2)],
  }));
}
export function consultationWarnings(plan: Consultation): string[] {
  const issues: string[] = [];
  if (plan.lines.some((l) => l.unitPrice === null)) issues.push('unpriced');
  if (
    plan.lines.some(
      (l) => !['sinus', 'graft'].includes(l.type) && l.positions.length !== l.quantity,
    )
  )
    issues.push('unassigned');
  if (plan.visits.some((v) => v.nights + 1 < itinerarySequence(plan, v.number).length))
    issues.push('shortStay');
  return issues;
}

export function unassignedConsultationUnits(plan: Consultation, visit: number) {
  return plan.lines
    .filter(
      (l) =>
        l.visit === visit &&
        l.quantity > l.positions.length &&
        !['sinus', 'graft'].includes(l.type),
    )
    .map((l) => ({ ...l, count: l.quantity - l.positions.length }));
}
