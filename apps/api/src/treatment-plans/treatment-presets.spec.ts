import { TREATMENT_PRESETS, conditionFromText, findPreset, parseToothNumbers } from '@dental-crm/shared';

// These presets encode protocols the clinic quotes by name, so the counts are the specification —
// "All-on-4" that produces five implants is wrong in a way no type checker will catch. Each tooth
// list is also checked for duplicates, because a repeated number silently under-counts the units a
// patient is being charged for.
describe('treatment presets', () => {
  const teethOf = (presetId: string, phaseNumber: number) =>
    findPreset(presetId)!
      .phases.find((p) => p.phaseNumber === phaseNumber)!
      .items.flatMap((i) => i.teeth);

  it('quotes All-on-4 as two visits, with both jaws in the surgical visit', () => {
    const preset = findPreset('all-on-4-both')!;
    expect(preset.phases).toHaveLength(2);
    expect(teethOf('all-on-4-both', 1)).toHaveLength(8);
    expect(teethOf('all-on-4-both', 2)).toHaveLength(24);
  });

  it('puts the healing period on the last surgical phase, before the crowns', () => {
    const preset = findPreset('all-on-4-both')!;
    expect(preset.phases.find((p) => p.phaseNumber === 1)?.healingPeriodMonths).toBe(3);
    expect(preset.phases.find((p) => p.phaseNumber === 2)?.healingPeriodMonths).toBeUndefined();
  });

  it('places All-on-4 implants in the upper arch first, then the lower', () => {
    const surgery = findPreset('all-on-4-both')!.phases[0];
    expect(surgery.items[0].teeth.every((t) => t[0] === '1' || t[0] === '2')).toBe(true);
    expect(surgery.items[1].teeth.every((t) => t[0] === '3' || t[0] === '4')).toBe(true);
  });

  it('quotes All-on-6 as two visits with twelve surgical implants', () => {
    const preset = findPreset('all-on-6-both')!;
    expect(preset.phases).toHaveLength(2);
    expect(teethOf('all-on-6-both', 1)).toHaveLength(12);
    expect(teethOf('all-on-6-both', 2)).toHaveLength(24);
    expect(preset.phases[0].healingPeriodMonths).toBe(3);
  });

  it('sizes the crown-only presets to their names', () => {
    expect(teethOf('crowns-24', 1)).toHaveLength(24);
    expect(teethOf('crowns-28', 1)).toHaveLength(28);
  });

  it('stages 12 implants then 24 crowns', () => {
    expect(teethOf('implants-12-crowns-24', 1)).toHaveLength(12);
    expect(teethOf('implants-12-crowns-24', 2)).toHaveLength(24);
  });

  it('never repeats a tooth within one item', () => {
    for (const preset of TREATMENT_PRESETS) {
      for (const phase of preset.phases) {
        for (const item of phase.items) {
          expect(new Set(item.teeth).size).toBe(item.teeth.length);
        }
      }
    }
  });

  it('describes every item so the chart can resolve a condition for it', () => {
    for (const preset of TREATMENT_PRESETS) {
      for (const phase of preset.phases) {
        for (const item of phase.items) {
          expect(conditionFromText(item.categoryName, item.description)).toBeDefined();
        }
      }
    }
  });

  it('round-trips a joined tooth list back to the same teeth', () => {
    const teeth = teethOf('crowns-28', 1);
    expect(parseToothNumbers(teeth.join(' '))).toEqual(teeth);
  });
});
