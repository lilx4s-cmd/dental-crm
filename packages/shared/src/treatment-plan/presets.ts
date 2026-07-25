// Ready-made plans for the protocols a clinic quotes over and over. Building an All-on-4 by hand
// means typing eight implants and twenty-four crowns across three phases with the right teeth on
// each — slow, and easy to get a tooth number wrong on. These encode the standard shape once so
// staff start from a correct plan and adjust prices, rather than assembling it from nothing.
//
// Tooth positions follow FDI notation; see tooth-geometry.ts.

/** First molar to first molar — the usual twelve-unit full-arch span. */
const UPPER_12 = ['16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26'];
const LOWER_12 = ['46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36'];

/** Second molar to second molar — fourteen units per arch, everything but the wisdom teeth. */
const UPPER_14 = ['17', ...UPPER_12, '27'];
const LOWER_14 = ['47', ...LOWER_12, '37'];

// All-on-4 places two axial implants at the front and two tilted at the back of each arch, which
// avoids the sinus and the inferior alveolar nerve without grafting.
const UPPER_ALL_ON_4 = ['15', '13', '23', '25'];
const LOWER_ALL_ON_4 = ['45', '43', '33', '35'];

const UPPER_6 = ['16', '14', '12', '22', '24', '26'];
const LOWER_6 = ['46', '44', '42', '32', '34', '36'];

export interface PresetItem {
  description: string;
  /** Matched case-insensitively against the clinic's TreatmentCategory names; skipped if absent. */
  categoryName?: string;
  material?: string;
  teeth: string[];
}

export interface PresetPhase {
  phaseNumber: number;
  name?: string;
  /** Months of healing before the next phase can start. */
  healingPeriodMonths?: number;
  items: PresetItem[];
}

export interface TreatmentPreset {
  id: string;
  name: string;
  summary: string;
  phases: PresetPhase[];
}

const ZIRCONIA = { description: 'Zirconia Crown', categoryName: 'Crown', material: 'Zirconia' };

export const TREATMENT_PRESETS: TreatmentPreset[] = [
  {
    id: 'all-on-4-both',
    name: 'All-on-4 — both jaws',
    summary: '4 upper implants, then 4 lower, then 24 zirconia crowns after 3 months of healing.',
    phases: [
      {
        phaseNumber: 1,
        name: 'Upper implants',
        items: [{ description: 'Implant', categoryName: 'Implant', teeth: UPPER_ALL_ON_4 }],
      },
      {
        phaseNumber: 2,
        name: 'Lower implants',
        healingPeriodMonths: 3,
        items: [{ description: 'Implant', categoryName: 'Implant', teeth: LOWER_ALL_ON_4 }],
      },
      {
        phaseNumber: 3,
        name: 'Prosthetics',
        items: [{ ...ZIRCONIA, teeth: [...UPPER_12, ...LOWER_12] }],
      },
    ],
  },
  {
    id: 'all-on-4-upper',
    name: 'All-on-4 — upper only',
    summary: '4 upper implants, then 12 zirconia crowns after 3 months of healing.',
    phases: [
      {
        phaseNumber: 1,
        name: 'Upper implants',
        healingPeriodMonths: 3,
        items: [{ description: 'Implant', categoryName: 'Implant', teeth: UPPER_ALL_ON_4 }],
      },
      { phaseNumber: 2, name: 'Prosthetics', items: [{ ...ZIRCONIA, teeth: UPPER_12 }] },
    ],
  },
  {
    id: 'implants-12-crowns-24',
    name: '12 implants + 24 crowns',
    summary: '6 implants per jaw, then 24 zirconia crowns after 3 months of healing.',
    phases: [
      {
        phaseNumber: 1,
        name: 'Implants',
        healingPeriodMonths: 3,
        items: [{ description: 'Implant', categoryName: 'Implant', teeth: [...UPPER_6, ...LOWER_6] }],
      },
      { phaseNumber: 2, name: 'Prosthetics', items: [{ ...ZIRCONIA, teeth: [...UPPER_12, ...LOWER_12] }] },
    ],
  },
  {
    id: 'crowns-24',
    name: '24 zirconia crowns',
    summary: 'Twelve units per jaw, first molar to first molar. No surgical phase.',
    phases: [{ phaseNumber: 1, items: [{ ...ZIRCONIA, teeth: [...UPPER_12, ...LOWER_12] }] }],
  },
  {
    id: 'crowns-28',
    name: '28 zirconia crowns',
    summary: 'Fourteen units per jaw, second molar to second molar. No surgical phase.',
    phases: [{ phaseNumber: 1, items: [{ ...ZIRCONIA, teeth: [...UPPER_14, ...LOWER_14] }] }],
  },
];

export function findPreset(id: string): TreatmentPreset | undefined {
  return TREATMENT_PRESETS.find((p) => p.id === id);
}
