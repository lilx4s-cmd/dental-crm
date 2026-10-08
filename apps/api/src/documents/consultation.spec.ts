import {
  ConsultationSchema,
  DocumentConfigurationSchema,
  CONSULTATION_COPY,
  PROCEDURES,
  DOCUMENT_LANGUAGES,
  parseConsultation,
  consultationTotals,
  consultationChart,
  consultationToothGeometry,
  consultationItinerary,
  type Consultation,
} from '@dental-crm/shared';
const config = DocumentConfigurationSchema.parse({
  priceList: [
    { type: 'implant', currency: 'USD', unitPrice: 350 },
    { type: 'crown', currency: 'USD', unitPrice: 120, material: 'Zirconia' },
    { type: 'veneer', currency: 'USD', unitPrice: 150, material: 'E.max' },
  ],
  healing: { minMonths: 3, maxMonths: 4 },
});
function proposal(text: string): Consultation {
  const { lines, warnings } = parseConsultation(text, 'USD', config);
  expect(warnings).toEqual([]);
  return {
    version: 1,
    treatmentText: text,
    language: 'en',
    currency: 'USD',
    lines,
    visits: [...new Set(lines.map((l) => l.visit))].map((number) => ({
      number,
      nights: number === 1 ? 5 : 7,
      hotelRate: 60,
      hotelIncluded: false,
      transfer: 'included',
      transferPrice: 0,
      itinerary: [],
    })),
    healing: config.healing,
    findings: {},
    includedServices: [],
  };
}
describe('consultation acceptance', () => {
  it.each([1, 4, 6, 7, 10, 12])(
    'parses %i implants without inventing FDI positions',
    (quantity) => {
      const plan = proposal(`${quantity} implants`);
      expect(plan.lines[0].quantity).toBe(quantity);
      expect(plan.lines[0].positions).toEqual([]);
      expect(Object.keys(consultationChart(plan, 1))).toHaveLength(0);
    },
  );
  it.each([8, 20, 24, 28])('parses %i crowns with clinic pricing', (quantity) => {
    const plan = proposal(`${quantity} zirconium crowns`);
    expect(plan.lines[0]).toMatchObject({
      quantity,
      type: 'crown',
      unitPrice: 120,
      material: 'Zirconia',
      visit: 1,
    });
  });
  it.each([16, 20, 24])('parses %i veneers with clinic pricing', (quantity) =>
    expect(proposal(`${quantity} Emax veneers`).lines[0]).toMatchObject({
      quantity,
      type: 'veneer',
      unitPrice: 150,
    }),
  );
  it.each([
    '4 implants + 20 crowns',
    '7 implants + sinus lift',
    '12 implants + 24 crowns',
    'Extraction + implant + crown',
  ])('stages %s', (text) => {
    const plan = proposal(text);
    expect(plan.lines.filter((l) => l.type === 'crown').every((l) => l.visit === 2)).toBe(true);
    expect(plan.lines.filter((l) => l.type === 'implant').every((l) => l.visit === 1)).toBe(true);
  });
  it('calculates the requested 12 implant / 24 crown example exactly once', () => {
    expect(consultationTotals(proposal('12 implants + 24 zirconium crowns'))).toMatchObject({
      total: 7800,
      visits: [
        { treatments: 4200, hotel: 300, total: 4500 },
        { treatments: 2880, hotel: 420, total: 3300 },
      ],
    });
  });
  it('only splits implant quantities across jaws when stated', () => {
    const plan = proposal('6 upper implants + 6 lower implants + 24 crowns');
    expect(plan.lines.slice(0, 2).map((l) => [l.jaw, l.quantity])).toEqual([
      ['upper', 6],
      ['lower', 6],
    ]);
  });
  it('reads all-on-6 quantities without assigning guessed teeth', () => {
    const plan = proposal('All-on-6 both jaws');
    expect(plan.lines.map((l) => [l.quantity, l.jaw, l.positions])).toEqual([
      [6, 'upper', []],
      [6, 'lower', []],
    ]);
  });
  it('preserves explicitly supplied FDI positions', () => {
    const plan = proposal('2 implants at FDI 11, 21');
    expect(plan.lines[0].positions).toEqual(['11', '21']);
  });
  it('does not price a different material as the requested material', () =>
    expect(proposal('24 Emax crowns').lines[0].unitPrice).toBeNull());
  it('renders screw only in visit 1 and abutment/crown only when restored', () => {
    const plan = proposal('implant at tooth 11 + crown at tooth 11');
    expect(consultationChart(plan, 1)['11']).toBe('implant');
    expect(consultationChart(plan, 2)['11']).toBe('implantCrown');
    expect(consultationToothGeometry('11', 'implant').supragingival).toHaveLength(0);
    expect(consultationToothGeometry('11', 'implantCrown').supragingival.length).toBeGreaterThan(1);
  });
  it('marks a planned extraction without changing the recorded finding', () => {
    const plan = proposal('extraction at tooth 11');
    expect(consultationChart(plan, 1)).toEqual({ '11': 'extraction' });
    expect(consultationChart(plan, 1, 'recorded')).toEqual({});
    expect(consultationToothGeometry('11', 'extraction').supragingival.length).toBeGreaterThan(1);
    expect(consultationToothGeometry('11', 'missing')).toEqual({
      supragingival: [],
      subgingival: [],
    });
  });
  it('keeps crown roots but gives a bridge pontic no natural root', () => {
    const plan = proposal('bridge at tooth 11');
    plan.findings['11'] = 'missing';
    expect(consultationChart(plan, 1)['11']).toBe('bridgePontic');
    expect(consultationToothGeometry('11', 'bridgePontic').subgingival).toHaveLength(0);
    expect(consultationToothGeometry('11', 'crown').subgingival.length).toBeGreaterThan(0);
  });
  it.each(DOCUMENT_LANGUAGES)('has all patient-facing copy in %s', (language) => {
    expect(Object.keys(CONSULTATION_COPY[language]).sort()).toEqual(
      Object.keys(CONSULTATION_COPY.en).sort(),
    );
    for (const key of PROCEDURES) expect(CONSULTATION_COPY[language][key]).toBeTruthy();
  });
  it('N nights produces N+1 itinerary days and omits unselected surgery', () => {
    const plan = proposal('24 crowns');
    expect(consultationItinerary(plan, 1)).toHaveLength(6);
    expect(consultationItinerary(plan, 1).some((d) => d.key === 'surgery')).toBe(false);
  });
  it('keeps custom itinerary edits', () => {
    const plan = proposal('implant');
    plan.visits[0].itinerary = [{ day: 3, text: 'Confirmed appointment' }];
    expect(consultationItinerary(plan, 1)).toEqual([{ day: 3, text: 'Confirmed appointment' }]);
  });
  it.each(['included', 'excluded', 'paid'] as const)(
    'calculates transfer mode %s without double charging',
    (transfer) => {
      const plan = proposal('implant');
      plan.visits[0] = { ...plan.visits[0], hotelIncluded: true, transfer, transferPrice: 75 };
      expect(consultationTotals(plan).total).toBe(350 + (transfer === 'paid' ? 75 : 0));
    },
  );
  it('detects duplicate mappings and positions', () => {
    const plan = proposal('implant at tooth 11');
    plan.lines.push({ ...plan.lines[0], id: 'duplicate' });
    expect(ConsultationSchema.safeParse(plan).success).toBe(false);
  });
  it.each([0, -1, 1.2, Infinity, NaN])('rejects invalid quantity %s', (quantity) => {
    const plan = proposal('implant');
    plan.lines[0].quantity = quantity;
    expect(ConsultationSchema.safeParse(plan).success).toBe(false);
  });
  it('rejects impossible visit, FDI, price and itinerary inputs', () => {
    const plan = proposal('implant');
    plan.lines[0].positions = ['99'];
    plan.lines[0].unitPrice = -1;
    plan.visits[0].itinerary = [{ day: 7, text: 'Too late' }];
    expect(ConsultationSchema.safeParse(plan).success).toBe(false);
  });
  it('uses no healing interval unless the clinic configured it', () =>
    expect(DocumentConfigurationSchema.parse({}).healing).toBeNull());
});
